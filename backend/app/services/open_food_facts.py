"""
Open Food Facts (OFF) lookup by barcode.

OFF is a free, open, crowd-sourced food database (ODbL licence) with many
Indian products. When a shopper scans a barcode nobody has scanned in
LabelPadho yet, we try OFF first: if it has the product, we can build an
audit instantly without photos or a Gemini call. If not, the shopper falls
back to photographing the label.

API docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
"""

import logging
import re

import httpx
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.services.naming import clean_brand
from app.models.schemas import (
    ExtractedIngredient,
    LabelExtraction,
    NutritionInfo,
    ProductCategory,
)

logger = logging.getLogger(__name__)

BARCODE_RE = re.compile(r"^\d{8,14}$")


class OFFSettings(BaseSettings):
    # OFF asks API clients to identify themselves; set a contact in production, e.g.
    # OFF_USER_AGENT="LabelPadho/1.0 (you@example.com)"
    off_user_agent: str = "LabelPadho/1.0"
    off_base_url: str = "https://world.openfoodfacts.org"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = OFFSettings()

FIELDS = ",".join([
    "code", "product_name", "product_name_en", "brands", "quantity", "product_quantity",
    "serving_quantity", "nutriments", "ingredients_text_en", "ingredients_text",
    "categories_tags", "labels",
])

# (keyword in OFF category tags, our category, our sub-category) — first match wins
CATEGORY_RULES: list[tuple[str, ProductCategory, str | None]] = [
    ("protein-bar", ProductCategory.PROTEIN_FITNESS, "protein_bar"),
    ("protein-powder", ProductCategory.PROTEIN_FITNESS, "protein_powder"),
    ("peanut-butter", ProductCategory.PROTEIN_FITNESS, "nut_butter"),
    ("instant-noodle", ProductCategory.SAVORY_SNACK, "instant_noodles"),
    ("noodle", ProductCategory.SAVORY_SNACK, "instant_noodles"),
    ("popcorn", ProductCategory.SAVORY_SNACK, "popcorn"),
    ("chips", ProductCategory.SAVORY_SNACK, "chips_crisps"),
    ("crisps", ProductCategory.SAVORY_SNACK, "chips_crisps"),
    ("namkeen", ProductCategory.SAVORY_SNACK, "namkeen_bhujia"),
    ("bhujia", ProductCategory.SAVORY_SNACK, "namkeen_bhujia"),
    ("crackers", ProductCategory.SAVORY_SNACK, "crackers"),
    ("salty-snacks", ProductCategory.SAVORY_SNACK, None),
    ("nuts", ProductCategory.SAVORY_SNACK, "nuts_seeds"),
    ("chocolate", ProductCategory.DESSERT_SWEET, "chocolate"),
    ("biscuit", ProductCategory.DESSERT_SWEET, "biscuit_cookie"),
    ("cookie", ProductCategory.DESSERT_SWEET, "biscuit_cookie"),
    ("cake", ProductCategory.DESSERT_SWEET, "cake_pastry"),
    ("ice-cream", ProductCategory.DESSERT_SWEET, "ice_cream"),
    ("candies", ProductCategory.DESSERT_SWEET, "candy"),
    ("confectioner", ProductCategory.DESSERT_SWEET, "candy"),
    ("sweets", ProductCategory.DESSERT_SWEET, "mithai"),
    ("energy-drink", ProductCategory.BEVERAGE_SODA, "energy_drink"),
    ("soda", ProductCategory.BEVERAGE_SODA, "soft_drink"),
    ("carbonated", ProductCategory.BEVERAGE_SODA, "soft_drink"),
    ("juice", ProductCategory.BEVERAGE_JUICE, "fruit_juice"),
    ("fruit-drink", ProductCategory.BEVERAGE_JUICE, "fruit_juice"),
    ("plant-based-milk", ProductCategory.DAIRY_DAIRY_ALT, "plant_milk"),
    ("yogurt", ProductCategory.DAIRY_DAIRY_ALT, "curd_yogurt"),
    ("cheese", ProductCategory.DAIRY_DAIRY_ALT, "paneer_cheese"),
    ("milk", ProductCategory.DAIRY_DAIRY_ALT, "milk"),
    ("ketchup", ProductCategory.CONDIMENT_SAUCE, "ketchup_sauce"),
    ("sauce", ProductCategory.CONDIMENT_SAUCE, "ketchup_sauce"),
    ("mayonnaise", ProductCategory.CONDIMENT_SAUCE, "mayo_dressing"),
    ("jam", ProductCategory.CONDIMENT_SAUCE, "jam_spread"),
    ("spread", ProductCategory.CONDIMENT_SAUCE, "jam_spread"),
    ("pickle", ProductCategory.CONDIMENT_SAUCE, "pickle_chutney"),
    ("breakfast-cereal", ProductCategory.STAPLE_GRAIN, "breakfast_cereal"),
    ("oat", ProductCategory.STAPLE_GRAIN, "oats"),
    ("flour", ProductCategory.STAPLE_GRAIN, "atta_flour"),
    ("rice", ProductCategory.STAPLE_GRAIN, "rice"),
    ("bread", ProductCategory.STAPLE_GRAIN, "bread"),
    ("pasta", ProductCategory.STAPLE_GRAIN, "pasta_noodles"),
    ("beverages", ProductCategory.BEVERAGE_SODA, None),
    ("snacks", ProductCategory.SAVORY_SNACK, None),
]


def is_valid_barcode(code: str) -> bool:
    return bool(BARCODE_RE.match(code))


def _num(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _nutrition(nutriments: dict, suffix: str, serving_g: float | None = None) -> NutritionInfo:
    def get(key: str) -> float | None:
        return _num(nutriments.get(f"{key}_{suffix}"))

    sodium_g = get("sodium")
    if sodium_g is None and (salt := get("salt")) is not None:
        sodium_g = salt / 2.5  # salt = sodium x 2.5
    kcal = get("energy-kcal")
    if kcal is None and (kj := get("energy")) is not None:
        kcal = kj / 4.184
    return NutritionInfo(
        serving_size_g=serving_g if suffix == "serving" else 100,
        energy_kcal=round(kcal, 1) if kcal is not None else None,
        protein_g=get("proteins"),
        total_fat_g=get("fat"),
        saturated_fat_g=get("saturated-fat"),
        trans_fat_g=get("trans-fat"),
        carbohydrates_g=get("carbohydrates"),
        sugar_g=get("sugars"),
        added_sugar_g=get("added-sugars"),
        fiber_g=get("fiber"),
        sodium_mg=round(sodium_g * 1000, 1) if sodium_g is not None else None,
    )


def split_ingredients(text: str) -> list[ExtractedIngredient]:
    """Split 'Wheat flour (65%), Sugar, Oil (Palm, Cottonseed)' on top-level commas only."""
    parts, depth, current = [], 0, []
    for ch in text:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        if ch in ",;" and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(ch)
    parts.append("".join(current))

    ingredients = []
    for raw in parts:
        name = " ".join(raw.replace("_", "").split()).strip(" .*")
        if not name or len(name) > 160:
            continue
        pct = re.search(r"(\d+(?:\.\d+)?)\s*%", name)
        ingredients.append(ExtractedIngredient(name=name, percentage=float(pct.group(1)) if pct else None))
    return ingredients


_PACK_NOISE = re.compile(
    r"(\d+(\.\d+)?\s*(g|gm|gms|grm|grams?|kg|ml|l|ltr|ktr)\b|\b(rs\.?|₹)\s*\d+|\b\d+\s*rs\b"
    r"|\b(pc|pcs|pack|pouch|mrp|tpk|tetra\s*pack|pet|can|bottle)\b|\b\d{8,14}\b)\.?",
    re.IGNORECASE,
)


def clean_off_name(raw: str) -> str | None:
    """
    Crowd-sourced names often include pack size, price or the barcode itself:
    'Maggi Noodles Masala 70Grm Pc' → 'Maggi Noodles Masala', 'Bhujia400g' → 'Bhujia'.
    Returns None when nothing meaningful is left (e.g. the name was just digits).
    """
    cleaned = " ".join(_PACK_NOISE.sub(" ", raw).split()).strip(" -,|()")
    # Only drop a name when nothing is left (it was just a barcode / pack size).
    # Short or number-style names are real products: "50-50", "7Up", "Gems".
    if not any(c.isalnum() for c in cleaned):
        return None
    return cleaned


# Product types that are unambiguous from the name and often mis-tagged in OFF
NAME_FIRST_RULES: list[tuple[str, ProductCategory, str]] = [
    ("mayonnaise", ProductCategory.CONDIMENT_SAUCE, "mayo_dressing"),
    ("mayo", ProductCategory.CONDIMENT_SAUCE, "mayo_dressing"),
    ("ketchup", ProductCategory.CONDIMENT_SAUCE, "ketchup_sauce"),
    ("sauce", ProductCategory.CONDIMENT_SAUCE, "ketchup_sauce"),
    ("chutney", ProductCategory.CONDIMENT_SAUCE, "pickle_chutney"),
    ("pickle", ProductCategory.CONDIMENT_SAUCE, "pickle_chutney"),
    ("jam", ProductCategory.CONDIMENT_SAUCE, "jam_spread"),
]


def name_first_category(name: str | None) -> tuple[ProductCategory, str] | None:
    words = re.findall(r"[a-z]+", (name or "").lower())
    for keyword, category, sub in NAME_FIRST_RULES:
        if keyword in words:
            return category, sub
    return None


def _category(tags: list[str], name: str | None = None) -> tuple[ProductCategory, str | None]:
    if (by_name := name_first_category(name)) is not None:
        return by_name
    # OFF tags are often generic ("plant-based-foods"), so the product name helps too
    joined = (" ".join(tags or []) + " " + (name or "").replace(" ", "-")).lower()
    for keyword, category, sub in CATEGORY_RULES:
        if keyword in joined:
            return category, sub
    return ProductCategory.GENERAL_PACKAGED, None


def to_extraction(product: dict, barcode: str) -> LabelExtraction | None:
    """Map an OFF product to our LabelExtraction; None if it lacks usable nutrition."""
    nutriments = product.get("nutriments") or {}
    per_100g = _nutrition(nutriments, "100g")
    if all(getattr(per_100g, f) is None for f in ("energy_kcal", "protein_g", "sugar_g", "sodium_mg", "total_fat_g")):
        return None

    serving_g = _num(product.get("serving_quantity"))
    per_serving = _nutrition(nutriments, "serving", serving_g) if serving_g else NutritionInfo()
    if serving_g and all(getattr(per_serving, f) is None for f in ("energy_kcal", "sugar_g", "sodium_mg")):
        per_serving = NutritionInfo(serving_size_g=serving_g)  # sanitize step derives it from per-100g

    brand = clean_brand((product.get("brands") or "").split(",")[0].strip() or None)
    name = clean_off_name(product.get("product_name_en") or product.get("product_name") or "")
    category, sub = _category(product.get("categories_tags") or [], name)
    ingredients_text = product.get("ingredients_text_en") or product.get("ingredients_text") or ""

    return LabelExtraction(
        product_name=name,
        brand=brand,
        product_category=category,
        sub_category=sub,
        category_reasoning="Mapped from Open Food Facts categories",
        net_weight_g=_num(product.get("product_quantity")),
        barcode=barcode,
        nutrition_per_serving=per_serving,
        nutrition_per_100g=per_100g,
        ingredients=split_ingredients(ingredients_text) if ingredients_text else [],
    )


async def fetch_product(barcode: str) -> dict | None:
    """Return the OFF product dict, or None when OFF doesn't know this barcode."""
    url = f"{settings.off_base_url}/api/v2/product/{barcode}.json"
    async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": settings.off_user_agent}) as client:
        response = await client.get(url, params={"fields": FIELDS})
    if response.status_code == 404:
        return None
    response.raise_for_status()
    data = response.json()
    if data.get("status") != 1:
        return None
    return data.get("product") or None
