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

