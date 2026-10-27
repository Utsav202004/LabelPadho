"""
Pydantic schemas for LabelPadho.

These define the SHAPE of data flowing through our pipeline.
You already know Pydantic from your Portfolio Optimizer — same idea here,
but we're using some features you might not have used before.

NEW CONCEPTS:
=============

1. `Field(description=...)` — We add descriptions to each field.
   Why? Because we'll pass these schemas to Gemini as the expected output
   format. Gemini reads these descriptions to understand what to extract.
   Better descriptions = better extraction accuracy.

2. `list[Ingredient]` — Nested models. A ProductAnalysis contains a list
   of Ingredient objects. Pydantic validates the entire tree recursively.

3. `float | None = None` — Optional fields. The `|` syntax (Python 3.10+)
   means "float OR None". Default is None. This handles cases where a
   label doesn't show a certain nutrient.

4. `model_validator` — A validator that runs AFTER all fields are set.
   We use it to auto-compute derived values like price_per_g_protein.

Pipeline flow:
   Image → Gemini → LabelExtraction (raw extraction)
                         ↓
              analyzer.py enriches it
                         ↓
                  ProductAnalysis (final output with flags, scores, tips)
"""

from enum import Enum
from pydantic import BaseModel, Field, model_validator


class ProductCategory(str, Enum):
    """
    Standardized classification of food products.
    Allows category-specific evaluation instead of judging all foods by protein.
    """
    PROTEIN_FITNESS = "protein_fitness"    # Protein bars, whey, peanut butter, high-protein snacks
    STAPLE_GRAIN = "staple_grain"          # Atta, rice, oats, breakfast cereals, whole breads
    DESSERT_SWEET = "dessert_sweet"        # Mithai, chocolate, ice cream, cookies, sweet biscuits
    SAVORY_SNACK = "savory_snack"          # Chips, namkeen, bhujia, popcorn, instant noodles
    BEVERAGE_JUICE = "beverage_juice"      # Fruit juices, nectars, fruit pulps
    BEVERAGE_SODA = "beverage_soda"        # Carbonated drinks, energy drinks, colas
    DAIRY_DAIRY_ALT = "dairy_dairy_alt"    # Milk, paneer, curd, plant milks, cheeses
    CONDIMENT_SAUCE = "condiment_sauce"    # Ketchup, mayo, salad dressings, jams
    GENERAL_PACKAGED = "general_packaged"  # General food items with no specific category


# ============================================================
# Stage 1: What Gemini extracts from the label image
# ============================================================

class NutritionInfo(BaseModel):
    """Nutritional values as printed on the label."""

    serving_unit_description: str | None = Field(
        None,
        description=(
            "Serving wording exactly as printed, such as '1 biscuit', '2 cookies', "
            "or '30g (about 10 chips)'. Do not guess when it is not shown."
        ),
    )
    serving_size_g: float | None = Field(
        None,
        description="Serving size in grams as stated on the label"
    )
    servings_per_package: float | None = Field(
        None,
        description="Number of servings per package/container"
    )
    energy_kcal: float | None = Field(
        None,
        description="Energy in kilocalories (kcal) per serving"
    )
    protein_g: float | None = Field(
        None,
        description="Protein in grams per serving"
    )
    total_fat_g: float | None = Field(
        None,
        description="Total fat in grams per serving"
    )
    saturated_fat_g: float | None = Field(
        None,
        description="Saturated fat in grams per serving"
    )
    trans_fat_g: float | None = Field(
        None,
        description="Trans fat in grams per serving"
    )
    carbohydrates_g: float | None = Field(
        None,
        description="Total carbohydrates in grams per serving"
    )
    sugar_g: float | None = Field(
        None,
        description="Total sugars in grams per serving"
    )
    added_sugar_g: float | None = Field(
        None,
        description="Added sugars in grams per serving, if listed separately"
    )
    fiber_g: float | None = Field(
        None,
        description="Dietary fiber in grams per serving"
    )
    sodium_mg: float | None = Field(
        None,
        description="Sodium in milligrams per serving"
    )


class ExtractedIngredient(BaseModel):
    """A single ingredient as listed on the label."""

    name: str = Field(
        description="Ingredient name exactly as printed on the label"
    )
    percentage: float | None = Field(
        None,
        description="Percentage of ingredient if mentioned on the label (e.g., 'Wheat flour (65%)')"
    )


class LabelExtraction(BaseModel):
    """
    What Gemini extracts from the food label image(s).

    This is the RAW extraction — no analysis, no opinions, just facts
    from the label. Think of it as a structured transcript of the label.
    """

    product_name: str | None = Field(
        None,
        description="Product name as shown on the package"
    )
    product_category: ProductCategory = Field(
        default=ProductCategory.GENERAL_PACKAGED,
        description=(
            "Standardized category of the product. Choose one of: "
            "'protein_fitness', 'staple_grain', 'dessert_sweet', 'savory_snack', "
            "'beverage_juice', 'beverage_soda', 'dairy_dairy_alt', 'condiment_sauce', "
            "'general_packaged'"
        )
    )
    category_reasoning: str | None = Field(
        None,
        description="Brief reason why the product belongs to this category"
    )
    brand: str | None = Field(
        None,
        description="Brand name if visible"
    )
    net_weight_g: float | None = Field(
        None,
        description="Net weight/quantity of the package in grams"
    )
    nutrition_per_serving: NutritionInfo = Field(
        default_factory=NutritionInfo,
        description="Nutritional information per serving as printed"
    )
    nutrition_per_100g: NutritionInfo | None = Field(
        None,
        description="Nutritional information per 100g if listed separately on the label"
    )
    ingredients: list[ExtractedIngredient] = Field(
        default_factory=list,
        description="List of ingredients in order as printed (first ingredient = highest quantity)"
    )
    allergen_info: str | None = Field(
        None,
        description="Allergen warnings as printed (e.g., 'Contains: Milk, Soy, Wheat')"
    )
    claims: list[str] = Field(
        default_factory=list,
        description="Marketing claims on the package (e.g., 'High Protein', 'No Added Sugar', 'Loaded with Nuts')"
    )
    raw_claims_audit: list["ClaimVerification"] = Field(
        default_factory=list,
        description=(
            "Cross-examination of every marketing claim found on the packaging against the actual "
            "ingredients and nutrition table. Assign status ('verified', 'misleading', or 'debunked') "
            "with a crisp 1-sentence reality check."
        )
    )
    fssai_license: str | None = Field(
        None,
        description="FSSAI license number if visible"
    )


# ============================================================
# Stage 2: What our analyzer adds (flags, scores, insights)
# ============================================================

class IngredientFlag(BaseModel):
    """A concern or insight about a specific ingredient."""

    ingredient_name: str
    severity: str = Field(
        description="One of: 'high', 'medium', 'low', 'info'"
    )
    flag_type: str = Field(
        description="Category: 'banned_elsewhere', 'misleading', 'health_concern', 'hidden_name', 'info'"
    )
    title: str = Field(
        description="Short headline, e.g., 'Banned in European Union'"
    )
    explanation: str = Field(
        description="Plain-language explanation of why this is flagged"
    )
    source: str | None = Field(
        None,
        description="Regulatory source, e.g., 'EU Regulation 1333/2008'"
    )


class ServingReality(BaseModel):
    """
    The 'serving size trap' analysis.

    Many Indian snack brands list nutrition per serving, where a 'serving'
    is unrealistically small. E.g., a 150g packet lists 30g as a serving,
    but nobody eats just 30g of chips. This model exposes that gap.
    """

    stated_serving_g: float | None = None
    package_weight_g: float | None = None
    servings_in_package: float | None = None
    realistic_consumption: str = Field(
        default="",
        description="Plain-language note like 'Most people eat the entire 150g packet, which is 5 servings'"
    )
    nutrition_full_package: NutritionInfo | None = Field(
        None,
        description="Nutrition values if you eat the full package"
    )


class NaturalAlternative(BaseModel):
    """A natural/whole-food alternative to what this product provides."""

    nutrient: str = Field(
        description="What nutrient this alternative provides (e.g., 'protein')"
    )
    food_name: str = Field(
        description="Name of the natural food (e.g., 'Boiled Eggs')"
    )
    quantity: str = Field(
        description="How much you need (e.g., '2 eggs')"
    )
    nutrient_amount: str = Field(
        description="How much of the nutrient (e.g., '12g protein')"
    )
    approx_cost_inr: float | None = Field(
        None,
        description="Approximate cost in INR"
    )
    note: str = Field(
        default="",
        description="Additional context (e.g., 'Also provides 6g fat, Vitamin D')"
    )


class EducationalNote(BaseModel):
    """
    A teaching moment for the user.

    These explain WHY something matters — not just what's in the food,
    but what it does to your body. After the user has seen a concept
    multiple times, we stop showing it (tracked via topic_id).
    """

    topic_id: str = Field(
        description="Unique ID for this concept, e.g., 'sodium_effects', 'trans_fat_danger'"
    )
    title: str = Field(
        description="Headline, e.g., 'What does excess sodium do?'"
    )
    explanation: str = Field(
        description="Simple, jargon-free explanation"
    )
    triggered_by: str = Field(
        description="What in this product triggered this lesson, e.g., 'Sodium: 800mg (33% of daily limit)'"
    )


class PriceAnalysis(BaseModel):
    """Price-per-nutrient breakdown — the cost-effectiveness analysis."""

    price_inr: float
    price_per_g_protein: float | None = None
    price_per_g_fiber: float | None = None
    price_per_100_kcal: float | None = None
    value_verdict: str = Field(
        default="",
        description="Plain-language value assessment, e.g., 'Expensive for the protein you get'"
    )


class ClaimVerification(BaseModel):
    """
    Verification of front-of-pack claims against actual ingredients & nutrition numbers.
    Modeled after regulatory guidelines (FSSAI) and consumer advocacy.
    """
    claim: str = Field(description="The marketing claim made on the front (e.g. 'Multigrain', 'High Protein')")
    status: str = Field(description="'verified', 'misleading', or 'debunked'")
    explanation: str = Field(description="Clear explanation comparing claim to ingredients or macro math")
    fssai_rule: str | None = Field(None, description="Relevant FSSAI / standard regulation reference")


class MathVerification(BaseModel):
    """
    Atwater Physical Calorie Balance Verification:
    Tests whether the manufacturer's printed energy matches the sum of its macronutrients:
    Calories ≈ (Protein * 4) + (Carbs * 4) + (Fat * 9) + (Fiber * 2)
    """
    printed_calories: float | None = None
    calculated_calories: float | None = None
    discrepancy_percentage: float | None = None
    is_discrepant: bool = False
    details: str = Field(default="", description="Explanation of whether calories are under/over-reported")


class ProductAnalysis(BaseModel):
    """
    The complete analysis output — this is what the API returns.

    It combines the raw extraction with all our analysis layers:
    flags, price analysis, serving reality, alternatives, and education.
    """

    # Raw extraction
    extraction: LabelExtraction

    # Category classification
    product_category: ProductCategory = ProductCategory.GENERAL_PACKAGED
    category_display_name: str = "Packaged Food"

    # Analysis layers
    ingredient_flags: list[IngredientFlag] = Field(default_factory=list)
    serving_reality: ServingReality | None = None
    price_analysis: PriceAnalysis | None = None
    natural_alternatives: list[NaturalAlternative] = Field(default_factory=list)
    educational_notes: list[EducationalNote] = Field(default_factory=list)

    # Verification layers (Front-of-pack claims vs back reality + Calorie balance)
    claim_verifications: list["ClaimVerification"] = Field(
        default_factory=list,
        description="FSSAI & truth audit: comparing front marketing claims against ingredients & macros"
    )
    math_verification: "MathVerification | None" = Field(
        None,
        description="Atwater physical calorie balance test: verifies if printed calories match macronutrient sum"
    )

    # Overall summary
    health_score: int | None = Field(
        None,
        description="1-10 score based on ingredient quality, nutrient balance, and flags",
        ge=1, le=10
    )
    one_line_summary: str = Field(
        default="",
        description="One-line plain-language verdict, e.g., 'Marketed as healthy but high in sugar and sodium'"
    )
    detailed_summary: str = Field(
        default="",
        description="2-3 paragraph detailed breakdown for the user"
    )


# ============================================================
# API Request/Response models
# ============================================================

class AnalyzeRequest(BaseModel):
    """
    Metadata sent alongside image uploads.
    Images are sent as files (multipart/form-data), but structured
    data like price comes as JSON or form fields.
    """
    price_inr: float | None = Field(
        None,
        description="Price of the product in INR (optional)"
    )
    user_id: str | None = Field(
        None,
        description="User identifier for learning tracking (optional for now)"
    )


class AnalyzeResponse(BaseModel):
    """API response wrapper."""
    success: bool = True
    analysis: ProductAnalysis
    errors: list[str] = Field(default_factory=list)
