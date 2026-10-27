"""
Unit tests for the Analyzer logic in LabelPadho.

WHY UNIT TESTS MATTER HERE:
==========================
In technical interviews, interviewers often ask:
"How do you test an AI/ML application?"
Your killer answer:
"I decouple non-deterministic AI extraction from deterministic business logic.
The extraction outputs a strict Pydantic model. Once we have that model,
100% of the scoring, price-per-gram calculation, serving reality trap,
and ingredient flag detection is pure deterministic Python code.
I wrote automated test suites testing all edge cases (zero values, hidden trans fats,
misleading claims) using pytest without needing to make a single live API call to Gemini."
"""

import pytest
from app.models.schemas import (
    ExtractedIngredient,
    LabelExtraction,
    NutritionInfo,
    ProductCategory,
)
from app.services.analyzer import Analyzer


@pytest.fixture
def analyzer():
    return Analyzer()


def test_flag_harmful_additives(analyzer):
    """Ensure banned/flagged additives like Tartrazine and Potassium Bromate are caught."""
    extraction = LabelExtraction(
        product_name="Bright Bread",
        ingredients=[
            ExtractedIngredient(name="Refined Wheat Flour"),
            ExtractedIngredient(name="Potassium Bromate"),
            ExtractedIngredient(name="Tartrazine (INS 102)"),
        ],
        nutrition_per_serving=NutritionInfo(serving_size_g=50, protein_g=4),
    )

    analysis = analyzer.analyze(extraction)
    flagged_names = [f.ingredient_name for f in analysis.ingredient_flags]

    assert "Potassium Bromate" in flagged_names
    assert "Tartrazine (INS 102)" in flagged_names
    # Potassium bromate is high severity (carcinogen concern in EU)
    high_severity_flags = [f for f in analysis.ingredient_flags if f.severity == "high"]
    assert len(high_severity_flags) >= 1


def test_serving_size_trap_calculation(analyzer):
    """
    Test the serving size trap:
    A pack is 150g, but the serving size is listed as 30g (5 servings).
    If 1 serving has 300mg sodium, the whole pack has 1500mg!
    """
    extraction = LabelExtraction(
        product_name="Protein Nachos",
        net_weight_g=150.0,
        nutrition_per_serving=NutritionInfo(
            serving_size_g=30.0,
            servings_per_package=5.0,
            energy_kcal=140.0,
            protein_g=5.0,
            sodium_mg=300.0,
            sugar_g=2.0,
        ),
    )

    analysis = analyzer.analyze(extraction)
    reality = analysis.serving_reality

    assert reality is not None
    assert reality.servings_in_package == 5.0
    assert reality.nutrition_full_package.protein_g == 25.0
    assert reality.nutrition_full_package.sodium_mg == 1500.0
    # Realistic consumption string should alert the user
    assert "1500mg" in reality.realistic_consumption or "daily limit" in reality.realistic_consumption


def test_tiny_single_biscuit_serving_exposes_full_packet_sugar(analyzer):
    """A one-biscuit serving must not hide the packet-level sugar and calories."""
    extraction = LabelExtraction(
        product_name="P5 Vanilla Crème Biscuits",
        net_weight_g=48.0,
        ingredients=[
            ExtractedIngredient(name="Refined Wheat Flour"),
            ExtractedIngredient(name="Vegetable Oil"),
            ExtractedIngredient(name="Sugar"),
        ],
        nutrition_per_serving=NutritionInfo(
            serving_unit_description="1 biscuit",
            serving_size_g=8.0,
            servings_per_package=6.0,
            energy_kcal=38.0,
            sugar_g=2.5,
            added_sugar_g=2.4,
        ),
    )

    analysis = analyzer.analyze(extraction)
    reality = analysis.serving_reality

    assert reality is not None
    assert reality.nutrition_full_package.energy_kcal == 228.0
    assert reality.nutrition_full_package.added_sugar_g == 14.4
    assert "1 biscuit" in reality.realistic_consumption
    assert "very small stated serving" in reality.realistic_consumption
    assert any("not the same as dairy cream" in flag.title for flag in analysis.ingredient_flags)


def test_price_per_gram_protein(analyzer):
    """
    Test price-per-gram calculation:
    Product costs ₹100.
    Pack has 100g total weight.
    Per 100g protein is 20g.
    Price per g protein = 100 / 20 = ₹5.0/g.
    """
    extraction = LabelExtraction(
        product_name="High Protein Bar",
        net_weight_g=100.0,
        nutrition_per_serving=NutritionInfo(
            serving_size_g=50.0,
            servings_per_package=2.0,
            protein_g=10.0,
        ),
    )

    analysis = analyzer.analyze(extraction, price_inr=100.0)
    assert analysis.price_analysis is not None
    assert analysis.price_analysis.price_per_g_protein == 5.0


def test_natural_alternatives_suggested_for_protein(analyzer):
    """Ensure natural Indian whole foods (Eggs, Chana, Paneer) are suggested for protein items."""
    extraction = LabelExtraction(
        product_name="Gym Protein Snack",
        claims=["High Protein"],
        nutrition_per_serving=NutritionInfo(serving_size_g=50, protein_g=15),
    )

    analysis = analyzer.analyze(extraction, price_inr=150.0)
    assert len(analysis.natural_alternatives) > 0
    alt_names = [a.food_name for a in analysis.natural_alternatives]
    # Check that common staple proteins are present
    assert any("Egg" in name or "Chana" in name or "Paneer" in name for name in alt_names)


def test_educational_notes_tracked_and_suppressed(analyzer):
    """
    Ensure educational concepts (e.g. sodium effects) are delivered first,
    but suppressed if already in learned_topics.
    """
    extraction = LabelExtraction(
        product_name="Salty Crackers",
        nutrition_per_serving=NutritionInfo(
            serving_size_g=50,
            sodium_mg=800,  # High sodium
        ),
    )

    # First time: user hasn't learned 'sodium_effects'
    analysis_1 = analyzer.analyze(extraction, learned_topics=set())
    topic_ids_1 = [note.topic_id for note in analysis_1.educational_notes]
    assert "sodium_effects" in topic_ids_1

    # Second time: user has learned 'sodium_effects'
    analysis_2 = analyzer.analyze(extraction, learned_topics={"sodium_effects"})
    topic_ids_2 = [note.topic_id for note in analysis_2.educational_notes]
    assert "sodium_effects" not in topic_ids_2


def test_verify_multigrain_bread_with_maida_flagged(analyzer):
    """
    Test FSSAI claim auditing:
    A bread claims 'Multigrain', but the primary ingredient is Refined Wheat Flour (Maida).
    Should be flagged as misleading.
    """
    extraction = LabelExtraction(
        product_name="Healthy Multigrain Bread",
        claims=["Multigrain"],
        ingredients=[
            ExtractedIngredient(name="Refined Wheat Flour (Maida) (60%)"),
            ExtractedIngredient(name="Whole Wheat Flour (20%)"),
            ExtractedIngredient(name="Oats (5%)"),
        ],
        nutrition_per_serving=NutritionInfo(serving_size_g=50, protein_g=4),
    )

    analysis = analyzer.analyze(extraction)
    assert len(analysis.claim_verifications) > 0
    multigrain_check = next((c for c in analysis.claim_verifications if c.claim == "Multigrain"), None)
    assert multigrain_check is not None
    assert multigrain_check.status == "misleading"
    assert "Maida" in multigrain_check.explanation


def test_atwater_calorie_under_reporting_detected(analyzer):
    """
    Test Atwater physical calorie verification:
    Label claims 100 kcal, but:
    10g Protein (40 kcal) + 20g Carbs (80 kcal) + 10g Fat (90 kcal) = 210 kcal!
    The label is severely under-reporting calories.
    """
    extraction = LabelExtraction(
        product_name="Rigged Snack",
        nutrition_per_serving=NutritionInfo(
            serving_size_g=50,
            energy_kcal=100.0,  # Falsely low
            protein_g=10.0,     # 40 kcal
            carbohydrates_g=20.0, # 80 kcal
            total_fat_g=10.0,   # 90 kcal -> total 210 kcal
        ),
    )

    analysis = analyzer.analyze(extraction)
    math = analysis.math_verification
    assert math is not None
    assert math.is_discrepant is True
    assert math.calculated_calories == 210.0
    assert "Calorie Under-reporting" in math.details


def test_dessert_category_does_not_suggest_protein_or_calculate_protein_price(analyzer):
    """
    Test category-aware evaluation for Desserts:
    - Should NOT calculate price per gram of protein
    - Should NOT suggest eggs, sattu, or chicken
    - Should suggest wholesome sweet treats (dates, dark chocolate)
    """
    extraction = LabelExtraction(
        product_name="Dark Chocolate Bar",
        product_category=ProductCategory.DESSERT_SWEET,
        net_weight_g=100.0,
        ingredients=[
            ExtractedIngredient(name="Cocoa Beans"),
            ExtractedIngredient(name="Cocoa Butter"),
            ExtractedIngredient(name="Raw Cane Sugar"),
        ],
        nutrition_per_serving=NutritionInfo(
            serving_size_g=25.0,
            energy_kcal=140.0,
            protein_g=2.0,      # Small natural protein amount
            carbohydrates_g=12.0,
            sugar_g=8.0,
            total_fat_g=9.0,
        ),
    )

    analysis = analyzer.analyze(extraction, price_inr=150.0)

    # 1. Price analysis: protein price should be None!
    assert analysis.price_analysis is not None
    assert analysis.price_analysis.price_per_g_protein is None

    # 2. Alternatives: should NOT suggest eggs or sattu!
    alt_names = [a.food_name.lower() for a in analysis.natural_alternatives]
    assert not any("egg" in name for name in alt_names)
    assert not any("sattu" in name for name in alt_names)
    assert any("dates" in name or "dark chocolate" in name for name in alt_names)

    # 3. Category display name is populated
    assert analysis.category_display_name == "Dessert & Sweet Treat"


def test_beverage_soda_category_alternatives_and_penalty(analyzer):
    """
    Test category-aware evaluation for Sodas:
    - Should heavily penalize liquid sugar (>20g)
    - Should suggest refreshing beverage alternatives (coconut water, nimbu pani, chaas)
    """
    extraction = LabelExtraction(
        product_name="Cola Fizzy Drink",
        product_category=ProductCategory.BEVERAGE_SODA,
        net_weight_g=250.0,
        ingredients=[
            ExtractedIngredient(name="Carbonated Water"),
            ExtractedIngredient(name="Sugar"),
            ExtractedIngredient(name="Caramel Color (INS 150d)"),
        ],
        nutrition_per_serving=NutritionInfo(
            serving_size_g=250.0,
            energy_kcal=105.0,
            protein_g=0.0,
            carbohydrates_g=26.0,
            sugar_g=26.0,  # High liquid sugar!
        ),
    )

    analysis = analyzer.analyze(extraction, price_inr=40.0)

    # 1. Score should be penalized for extreme liquid sugar
    assert analysis.health_score <= 4

    # 2. Alternatives should be refreshing drinks
    alt_names = [a.food_name.lower() for a in analysis.natural_alternatives]
    assert any("coconut" in name or "chaas" in name or "nimbu" in name for name in alt_names)
    assert analysis.category_display_name == "Soda & Soft Drink"


def test_no_palm_oil_claim_replacement_audit(analyzer):
    """
    Test 'No Palm Oil' claim verification:
    If manufacturer replaced palm oil with cottonseed or sunflower oil,
    verify that it confirms absence of palm oil while auditing the replacement oil.
    """
    extraction = LabelExtraction(
        product_name="Crunchy Namkeen",
        claims=["No Palm Oil", "Cholesterol Free"],
        ingredients=[
            ExtractedIngredient(name="Besan (Gram Flour)"),
            ExtractedIngredient(name="Refined Sunflower Oil"),
            ExtractedIngredient(name="Iodized Salt"),
        ],
        nutrition_per_serving=NutritionInfo(serving_size_g=30.0, energy_kcal=150.0),
    )

    analysis = analyzer.analyze(extraction)
    palm_check = next((c for c in analysis.claim_verifications if c.claim == "No Palm Oil"), None)
    assert palm_check is not None
    assert palm_check.status == "verified"
    assert "Sunflower" in palm_check.explanation or "seed oil" in palm_check.explanation

    choles_check = next((c for c in analysis.claim_verifications if c.claim == "Cholesterol Free"), None)
    assert choles_check is not None
    assert choles_check.status == "misleading"
    assert "plant-based" in choles_check.explanation


def test_source_of_protein_and_fibre_quantification(analyzer):
    """
    Test quantification of 'Source of Protein' and 'Source of Fibre':
    If a 30g snack has only 1g protein (3.3g/100g), it fails the 5.5g/100g FSSAI threshold.
    """
    extraction = LabelExtraction(
        product_name="P4 Style Snack",
        claims=["Source of Protein", "Source of Fibre", "No Added Preservatives"],
        ingredients=[
            ExtractedIngredient(name="Corn Flour"),
            ExtractedIngredient(name="Rice Flour"),
            ExtractedIngredient(name="TBHQ (INS 319)"),  # Synthetic preservative/antioxidant!
        ],
        nutrition_per_serving=NutritionInfo(
            serving_size_g=30.0,
            energy_kcal=130.0,
            protein_g=1.0,  # 3.3g/100g -> fails FSSAI 5.5g threshold
            fiber_g=0.6,    # 2.0g/100g -> fails FSSAI 3.0g threshold
        ),
    )

    analysis = analyzer.analyze(extraction)
    
    # 1. Protein check should be debunked (fails 5.5g/100g)
    protein_check = next((c for c in analysis.claim_verifications if c.claim == "Source of Protein"), None)
    assert protein_check is not None
    assert protein_check.status == "debunked"
    assert "3.3g per 100g" in protein_check.explanation

    # 2. Fibre check should be debunked (fails 3.0g/100g)
    fibre_check = next((c for c in analysis.claim_verifications if c.claim == "Source of Fibre"), None)
    assert fibre_check is not None
    assert fibre_check.status == "debunked"
    assert "2.0g per 100g" in fibre_check.explanation

    # 3. Preservative check should be debunked because of TBHQ (INS 319)
    preservative_check = next((c for c in analysis.claim_verifications if c.claim == "No Added Preservatives"), None)
    assert preservative_check is not None
    assert preservative_check.status == "debunked"
    assert "TBHQ" in preservative_check.explanation


def test_p2_sample_no_maida_and_nuts_audit(analyzer):
    """
    Test P2 sample claims:
    - 'No Added Maida' with hidden tapioca/corn starches -> misleading
    - 'Loaded with Nuts' with < 5% almonds -> audited
    """
    extraction = LabelExtraction(
        product_name="P2 Super Cookie",
        claims=["No Added Maida", "Loaded with Nuts"],
        ingredients=[
            ExtractedIngredient(name="Whole Wheat Flour"),
            ExtractedIngredient(name="Tapioca Starch"),
            ExtractedIngredient(name="Almonds (3%)"),
        ],
        nutrition_per_serving=NutritionInfo(serving_size_g=50.0, energy_kcal=220.0),
    )

    analysis = analyzer.analyze(extraction)
    maida_check = next((c for c in analysis.claim_verifications if c.claim == "No Added Maida"), None)
    assert maida_check is not None
    assert maida_check.status == "misleading"
    assert "tapioca starch" in maida_check.explanation

    nuts_check = next((c for c in analysis.claim_verifications if c.claim == "Loaded with Nuts"), None)
    assert nuts_check is not None
    assert nuts_check.status == "misleading"
    assert "Almonds" in nuts_check.explanation


def test_dynamic_unseen_marketing_claims_are_preserved(analyzer):
    """
    Ensure that arbitrary, unseen marketing claims generated dynamically by the LLM
    (e.g., 'Brain Booster', 'Guilt-Free Munching') are preserved and not lost.
    """
    from app.models.schemas import ClaimVerification

    extraction = LabelExtraction(
        product_name="Futuristic Snack",
        claims=["Brain Booster"],
        raw_claims_audit=[
            ClaimVerification(
                claim="Brain Booster",
                status="debunked",
                explanation="No recognized cognitive enhancement nutrients present in the ingredients list.",
                fssai_rule="FSSAI Misleading Claims Section 24",
            )
        ],
        nutrition_per_serving=NutritionInfo(serving_size_g=30.0, energy_kcal=120.0),
    )

    analysis = analyzer.analyze(extraction)
    unseen_check = next((c for c in analysis.claim_verifications if c.claim == "Brain Booster"), None)
    assert unseen_check is not None
    assert unseen_check.status == "debunked"
    assert "cognitive" in unseen_check.explanation

