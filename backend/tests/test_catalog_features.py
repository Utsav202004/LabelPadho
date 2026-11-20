"""Tests for catalog features: naming, sub-categories, MRP pricing, multi-use packs,
rename-with-token, suggestions, alternatives and the column migration.
No Gemini calls; the API runs against an in-memory SQLite database."""

import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

os.environ.setdefault("GEMINI_API_KEY", "test-key-not-used")

from app.core import db as db_module  # noqa: E402
from app.core.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models.db_models import ProductScan  # noqa: E402
from app.models.schemas import LabelExtraction, NutritionInfo, ProductCategory  # noqa: E402
from app.services.analyzer import Analyzer, sanitize_extraction  # noqa: E402
from app.services.naming import display_name, standardize_name  # noqa: E402


# --- Naming --------------------------------------------------------------------

@pytest.mark.parametrize("raw, expected", [
    ("BOURBON", "Bourbon"),
    ("MINI CAKE", "Mini Cake"),
    ("mini cake", "Mini Cake"),
    ("HALDIRAM'S", "Haldiram's"),
    ("KTC", "KTC"),
    ("2-MINUTE MASALA", "2-Minute Masala"),
    ("BREAD AND BUTTER", "Bread and Butter"),
    ("NutriChoice", "NutriChoice"),
    ("Aloo  Bhujia 150G", "Aloo Bhujia 150g"),
    ("   ", None),
    (None, None),
])
def test_standardize_name(raw, expected):
    assert standardize_name(raw) == expected


def test_display_name_does_not_repeat_brand_or_variant():
    assert display_name("Britannia", "Bourbon", "Chocolate Cream") == "Britannia Bourbon (Chocolate Cream)"
    assert display_name("Haldiram's", "Haldiram's Aloo Bhujia", None) == "Haldiram's Aloo Bhujia"
    assert display_name("Lay's", "Lays Classics Salted", None) == "Lays Classics Salted"


def test_sanitize_standardises_names_and_validates_sub_category():
    extraction = LabelExtraction(
        product_name="BOURBON", brand="BRITANNIA", variant="CHOCOLATE CREAM",
        product_category=ProductCategory.DESSERT_SWEET, sub_category="Biscuit_Cookie",
    )
    fixed = sanitize_extraction(extraction)
    assert (fixed.brand, fixed.product_name, fixed.variant) == ("Britannia", "Bourbon", "Chocolate Cream")
    assert fixed.sub_category == "biscuit_cookie"

    wrong_shelf = LabelExtraction(product_category=ProductCategory.DESSERT_SWEET, sub_category="ketchup_sauce")
    assert sanitize_extraction(wrong_shelf).sub_category is None


# --- Pricing: MRP vs price paid ---------------------------------------------------

def _protein_bar(**extra):
    return LabelExtraction(
        product_name="Protein Bar", net_weight_g=60, product_category=ProductCategory.PROTEIN_FITNESS,
        nutrition_per_serving=NutritionInfo(serving_size_g=60, servings_per_package=1, protein_g=20, energy_kcal=240),
        **extra,
    )


def test_mrp_alone_never_drives_price_maths():
    """MRP read from a photo can be wrong, so without a price paid there is no price analysis."""
    assert Analyzer().price_analysis_for(_protein_bar(mrp_inr=100), None) is None


def test_price_paid_drives_maths_and_mrp_is_info_only():
    price = Analyzer().price_analysis_for(_protein_bar(mrp_inr=100), 80)
    assert price.price_source == "paid"
    assert price.price_inr == 80
    assert price.price_per_g_protein == pytest.approx(4.0)
    assert (price.mrp_inr, price.discount_pct) == (100, 20.0)


def test_implausible_discount_from_misread_mrp_is_hidden():
    # MRP misread as 1000 (should be 10.00) must not claim "98% below MRP"
    price = Analyzer().price_analysis_for(_protein_bar(mrp_inr=1000), 20)
    assert price.discount_pct is None


def test_no_price_at_all_gives_no_price_analysis():
    assert Analyzer().price_analysis_for(_protein_bar(), None) is None


# --- Multi-use packs (ketchup) -------------------------------------------------------

def test_ketchup_bottle_is_judged_per_serving_not_whole_bottle():
    ketchup = LabelExtraction(
        product_name="Tomato Ketchup", net_weight_g=950, product_category=ProductCategory.CONDIMENT_SAUCE,
        nutrition_per_serving=NutritionInfo(serving_size_g=15, servings_per_package=63, sugar_g=3.8, sodium_mg=180),
    )
    text_out = Analyzer().analyze(ketchup).serving_reality.realistic_consumption
    assert "multi-use" in text_out
    assert "One 15g serving has 3.8g sugar, 180mg sodium" in text_out
    assert "The full packet has" not in text_out


def test_single_sitting_snack_still_warns_for_full_packet():
    chips = LabelExtraction(
        product_name="Chips", net_weight_g=150, product_category=ProductCategory.SAVORY_SNACK,
        nutrition_per_serving=NutritionInfo(serving_size_g=30, servings_per_package=5, sodium_mg=300),
    )
    assert "The full packet has 1500mg" in Analyzer().analyze(chips).serving_reality.realistic_consumption


# --- API: rename, suggestions, alternatives ---------------------------------------

@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    def override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = override
    now = datetime.now(timezone.utc)
    with Session(engine) as s:
        rows = [
            ProductScan(product_name="Bourbon", brand="Britannia", variant="Chocolate Cream",
                        product_category="dessert_sweet", sub_category="biscuit_cookie", health_score=3,
                        edit_token="secret-token-123", created_at=now),
            ProductScan(product_name="Marie Gold", brand="Britannia", product_category="dessert_sweet",
                        sub_category="biscuit_cookie", health_score=5, created_at=now - timedelta(hours=1)),
            ProductScan(product_name="Digestive", brand="McVitie's", product_category="dessert_sweet",
                        sub_category="biscuit_cookie", health_score=6, created_at=now - timedelta(hours=2)),
            ProductScan(product_name="Dark Chocolate", brand="Amul", product_category="dessert_sweet",
                        sub_category="chocolate", health_score=8, created_at=now - timedelta(hours=3)),
            ProductScan(product_name="Rasgulla", brand="Haldiram's", product_category="dessert_sweet",
                        sub_category="mithai", health_score=4, created_at=now - timedelta(hours=4)),
        ]
        s.add_all(rows)
        s.commit()
        ids = {r.product_name: r.id for r in rows}
    yield TestClient(app), ids
    app.dependency_overrides.clear()


def test_rename_requires_the_scanners_token(client):
    c, ids = client
    url = f"/api/history/{ids['Bourbon']}"
    denied = c.patch(url, json={"edit_token": "wrong-token-000", "product_name": "Hacked"})
    assert denied.status_code == 403

    ok = c.patch(url, json={"edit_token": "secret-token-123", "product_name": "GIMI GIMI BISCUIT",
                            "brand": "gimi gimi", "variant": ""})
    assert ok.status_code == 200
    body = ok.json()
    assert (body["product_name"], body["brand"], body["variant"]) == ("Gimi Gimi Biscuit", "Gimi Gimi", None)
    assert "edit_token" not in body


def test_suggestions_lists_latest_products_without_tokens(client):
    c, _ = client
    data = c.get("/api/products/suggestions", params={"limit": 3}).json()
    assert [d["product_name"] for d in data] == ["Bourbon", "Marie Gold", "Digestive"]
    assert all("edit_token" not in d for d in data)


def test_search_matches_variant(client):
    c, _ = client
    assert [d["product_name"] for d in c.get("/api/products/search", params={"q": "chocolate cream"}).json()] == ["Bourbon"]


def test_alternatives_compare_within_same_shelf(client):
    c, ids = client
    data = c.get(f"/api/products/{ids['Bourbon']}/alternatives").json()
    assert data["scope"] == "sub_category"
    assert data["scope_label"] == "Biscuits & Cookies"
    assert [b["product_name"] for b in data["better"]] == ["Digestive", "Marie Gold"]
    assert (data["rank"], data["total"]) == (3, 3)  # chocolate & mithai are not compared


def test_alternatives_fall_back_to_category_when_shelf_is_empty(client):
    c, ids = client
    data = c.get(f"/api/products/{ids['Rasgulla']}/alternatives").json()
    assert data["scope"] == "category"
    assert data["better"][0]["product_name"] == "Dark Chocolate"


# --- Migration ---------------------------------------------------------------------

def test_add_missing_columns_upgrades_an_old_table(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as conn:  # table as it existed before variant/sub_category/mrp/edit_token
        conn.execute(text(
            "CREATE TABLE productscan (id INTEGER PRIMARY KEY, product_name VARCHAR NOT NULL, brand VARCHAR)"
        ))
    monkeypatch.setattr(db_module, "engine", engine)
    db_module.add_missing_columns()
    cols = {c["name"] for c in inspect(engine).get_columns("productscan")}
    assert {"variant", "sub_category", "mrp_inr", "net_weight_g", "edit_token"} <= cols
    db_module.add_missing_columns()  # idempotent


# --- Rate limiting -------------------------------------------------------------------

def test_rate_limiter_blocks_after_limit_and_uses_rightmost_forwarded_ip():
    from fastapi import HTTPException
    from starlette.requests import Request

    from app.core.rate_limit import SlidingWindowLimiter, client_ip

    limiter = SlidingWindowLimiter("label scans", limit=2)
    limiter.check("1.1.1.1")
    limiter.check("1.1.1.1")
    limiter.check("2.2.2.2")  # other clients unaffected
    with pytest.raises(HTTPException) as exc:
        limiter.check("1.1.1.1")
    assert exc.value.status_code == 429
    assert "Retry-After" in exc.value.headers

    spoofed = Request({"type": "http", "headers": [(b"x-forwarded-for", b"6.6.6.6, 9.9.9.9")], "client": ("10.0.0.1", 1)})
    assert client_ip(spoofed) == "9.9.9.9"


def test_analyze_endpoint_is_rate_limited(client):
    from app.core.rate_limit import scan_limiter

    c, _ = client
    scan_limiter.reset()
    original = scan_limiter.limit
    scan_limiter.limit = 1
    try:
        # First call passes the limiter (then fails validation: no image); second is blocked
        assert c.post("/api/analyze").status_code == 422
        assert c.post("/api/analyze").status_code == 429
    finally:
        scan_limiter.limit = original
        scan_limiter.reset()


# --- Barcode + Open Food Facts --------------------------------------------------------

OFF_MAGGI = {
    "product_name": "Maggi Masala Noodles", "brands": "Maggi,Nestlé", "product_quantity": 70,
    "serving_quantity": 70, "categories_tags": ["en:plant-based-foods"],
    "ingredients_text_en": "Noodles (Wheat Flour (Atta) (62%), Palm Oil, Salt), Masala (Spices (12%), Sugar), Thickener (INS 508)",
    "nutriments": {"energy-kcal_100g": 427, "proteins_100g": 9.2, "fat_100g": 15.6, "saturated-fat_100g": 7.4,
                   "carbohydrates_100g": 62.8, "sugars_100g": 1.9, "sodium_100g": 1.23},
}


def test_off_product_maps_to_extraction():
    from app.services.open_food_facts import split_ingredients, to_extraction

    e = to_extraction(OFF_MAGGI, "8901058851298")
    assert (e.brand, e.product_name, e.barcode) == ("Maggi", "Maggi Masala Noodles", "8901058851298")
    assert e.sub_category == "instant_noodles"  # from the product name when tags are vague
    assert e.nutrition_per_100g.sodium_mg == 1230.0  # g → mg
    assert [i.name.split(" (")[0] for i in e.ingredients] == ["Noodles", "Masala", "Thickener"]
    assert split_ingredients("Sugar (40%), Cocoa")[0].percentage == 40.0
    assert to_extraction({"nutriments": {}}, "12345678") is None


def test_barcode_lookup_uses_catalog_then_off(client, monkeypatch):
    from app.services import open_food_facts as off

    c, ids = client
    assert c.get("/api/products/barcode/12ab").status_code == 422

    calls = []

    async def fake_fetch(code):
        calls.append(code)
        return OFF_MAGGI if code == "8901058851298" else None

    monkeypatch.setattr(off, "fetch_product", fake_fetch)
    first = c.get("/api/products/barcode/8901058851298").json()
    assert first["found"] and first["source"] == "open_food_facts"
    audit = c.get(f"/api/history/{first['scan_id']}").json()
    assert audit["data_source"] == "open_food_facts" and audit["sub_category"] == "instant_noodles"

    again = c.get("/api/products/barcode/8901058851298").json()
    assert again["source"] == "catalog" and again["scan_id"] == first["scan_id"]
    assert calls == ["8901058851298"]  # second lookup never hit the network

    missing = c.get("/api/products/barcode/00000000").json()
    assert missing["found"] is False and "Photograph its label" in missing["message"]


# --- Reports ----------------------------------------------------------------------------

def test_reports_are_counted_and_admin_queue_is_protected(client, monkeypatch):
    c, ids = client
    url = f"/api/history/{ids['Bourbon']}/report"
    assert c.post(url, json={"reason": "made_up"}).status_code == 422
    assert c.post(url, json={"reason": "wrong_nutrition", "details": "sugar looks off"}).json()["report_count"] == 1
    assert c.get(f"/api/history/{ids['Bourbon']}").status_code in (200, 500)  # seeded rows have empty JSON

    assert c.get("/api/reports").status_code == 404  # disabled without an admin key
    monkeypatch.setenv("ADMIN_KEY", "admin-secret")
    assert c.get("/api/reports").status_code == 401
    rows = c.get("/api/reports", headers={"X-Admin-Key": "admin-secret"}).json()
    assert rows[0]["product_name"] == "Bourbon" and rows[0]["reason"] == "wrong_nutrition"


# --- Translation --------------------------------------------------------------------------

def test_translation_changes_prose_only_and_is_cached(client, monkeypatch):
    import json as _json

    from app.api.routes import translate as translate_route
    from app.core.db import get_session as _gs

    c, _ = client
    analysis = Analyzer().analyze(LabelExtraction(
        product_name="Chips", product_category=ProductCategory.SAVORY_SNACK,
        nutrition_per_serving=NutritionInfo(serving_size_g=30, servings_per_package=5, sodium_mg=300),
        net_weight_g=150,
    ))
    session = next(app.dependency_overrides[_gs]())
    scan = ProductScan(product_name="Chips", full_analysis_json=analysis.model_dump_json(), health_score=analysis.health_score)
    session.add(scan)
    session.commit()

    calls = []

    async def fake_translate(_extractor, texts, language):
        calls.append(language)
        return {k: f"HI:{v}" for k, v in texts.items()}

    monkeypatch.setattr(translate_route, "translate_texts", fake_translate)
    out = c.post("/api/translate", json={"scan_id": scan.id, "lang": "hi"}).json()
    assert out["language"] == "hi"
    assert out["one_line_summary"].startswith("HI:")
    assert out["health_score"] == analysis.health_score  # numbers untouched
    assert out["serving_reality"]["nutrition_full_package"]["sodium_mg"] == 1500.0

    c.post("/api/translate", json={"scan_id": scan.id, "lang": "hi"})
    assert len(calls) == 1  # second request served from cache
    session.refresh(scan)
    assert "hi" in _json.loads(scan.translations_json)



def test_delete_requires_scanner_token_or_admin(client, monkeypatch):
    c, ids = client
    url = f"/api/history/{ids['Marie Gold']}"
    assert c.delete(url).status_code == 403  # anonymous can't wipe the shared catalog
    monkeypatch.setenv("ADMIN_KEY", "admin-secret")
    assert c.delete(url, headers={"X-Admin-Key": "nope"}).status_code == 403
    assert c.delete(url, headers={"X-Admin-Key": "admin-secret"}).status_code == 200

    own = f"/api/history/{ids['Bourbon']}"
    assert c.delete(own, headers={"X-Edit-Token": "secret-token-123"}).status_code == 200


def test_seed_duplicate_detection_and_brand_cleanup():
    from app.services.naming import clean_brand
    from app.services.seed import is_duplicate, product_identity

    assert clean_brand("Pepsico India Holdings PVT LTD") == "Pepsico"
    assert clean_brand("The Coca-Cola Company") == "Coca-Cola"
    seen = {product_identity("Britannia", "Marie Gold Biscuit"), product_identity("Maggi", "Maggi Masala Noodles")}
    assert is_duplicate(product_identity("Britannia", "Britannia Vita Marie Gold Biscuits"), seen)
    assert is_duplicate(product_identity("Maggi", "Maggie Masala Noodles"), seen)
    assert not is_duplicate(product_identity("Britannia", "Good Day Cashew Cookies"), seen)
    assert not is_duplicate(product_identity("Haldiram's", "Aloo Bhujia"), seen)


def test_off_names_are_cleaned_of_pack_sizes_and_barcodes():
    from app.services.open_food_facts import clean_off_name

    assert clean_off_name("Haldiram Bhujia400g") == "Haldiram Bhujia"
    assert clean_off_name("Jim Jam92 G") == "Jim Jam"
    assert clean_off_name("Real Fruit Power Mixed Fruit 1Ktr Tpk") == "Real Fruit Power Mixed Fruit"
    assert clean_off_name("8906002006601") is None
    assert clean_off_name("7Up Super Duper") == "7Up Super Duper"
    assert clean_off_name("99% Cacao Dark Chocolate") == "99% Cacao Dark Chocolate"
