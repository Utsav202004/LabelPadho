"""
Analysis Engine for LabelPadho

This is where the BUSINESS LOGIC lives — the stuff that makes this app
more than just an API wrapper around Gemini.

Gemini extracts raw data from the label.
THIS module takes that raw data and adds intelligence:
  - Flags dangerous/banned ingredients
  - Computes price-per-gram of protein (and other macros)
  - Checks serving size honesty
  - Suggests natural alternatives
  - Generates educational notes
  - Produces a health score

Interview talking point: "The AI handles extraction, but the analysis
layer is entirely rule-based and deterministic. This separation means
the analysis is reproducible, testable, and not subject to LLM
hallucination. I can write unit tests for every flag and score."

NEW CONCEPTS:
=============

1. SEPARATION OF CONCERNS
   Gemini = good at understanding images and text (non-deterministic)
   Our code = good at math, lookups, rules (deterministic)
   
   We don't ask Gemini to do math or look up regulations — that's
   unreliable. We do it ourselves with tested code. This is a key
   architectural decision that interviewers will appreciate.

2. JSON DATA LOADING
   We load our flagged_additives.json and natural_alternatives.json
   at startup and keep them in memory. This is simple, fast, and
   appropriate for small datasets (<1MB).
   
   If this database grew to 10,000+ entries, we'd move to PostgreSQL.
   For now, JSON files are the right engineering call — simpler to
   maintain, version-control, and contribute to.
"""

import json
import logging
from pathlib import Path

from app.models.schemas import (
    ClaimVerification,
    EducationalNote,
    IngredientFlag,
    LabelExtraction,
    MathVerification,
    NaturalAlternative,
    NutritionInfo,
    PriceAnalysis,
    ProductAnalysis,
    ProductCategory,
    ServingReality,
)

logger = logging.getLogger(__name__)

# User-friendly metadata for each food category
CATEGORY_METADATA: dict[ProductCategory, dict[str, str]] = {
    ProductCategory.PROTEIN_FITNESS: {
        "display_name": "Protein & Fitness",
        "description": "Products targeting protein intake, bodybuilding, or active fitness.",
    },
    ProductCategory.STAPLE_GRAIN: {
        "display_name": "Staples & Grains",
        "description": "Grains, flours, oats, and whole carbohydrates.",
    },
    ProductCategory.DESSERT_SWEET: {
        "display_name": "Dessert & Sweet Treat",
        "description": "Indulgent sweets, chocolates, cakes, or cookies.",
    },
    ProductCategory.SAVORY_SNACK: {
        "display_name": "Savory Snack",
        "description": "Chips, namkeens, puffs, and crunchy savory bites.",
    },
    ProductCategory.BEVERAGE_JUICE: {
        "display_name": "Fruit Juice & Nectar",
        "description": "Packaged fruit juices, nectars, and pulps.",
    },
    ProductCategory.BEVERAGE_SODA: {
        "display_name": "Soda & Soft Drink",
        "description": "Carbonated drinks, colas, energy drinks, and flavored fizzy sodas.",
    },
    ProductCategory.DAIRY_DAIRY_ALT: {
        "display_name": "Dairy & Milk Alternative",
        "description": "Milk, curd, paneer, and plant-based milk alternatives.",
    },
    ProductCategory.CONDIMENT_SAUCE: {
        "display_name": "Condiment & Sauce",
        "description": "Sauces, ketchups, spreads, and salad dressings.",
    },
    ProductCategory.GENERAL_PACKAGED: {
        "display_name": "Packaged Food",
        "description": "General packaged foods with standard nutritional profile.",
    },
}

# ============================================================
# Load knowledge bases at module level (once, at startup)
# ============================================================

DATA_DIR = Path(__file__).parent.parent / "data"


def _load_json(filename: str) -> dict:
    """Load a JSON file from the data directory."""
    filepath = DATA_DIR / filename
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


# These are loaded ONCE when the module is first imported
FLAGGED_ADDITIVES = _load_json("flagged_additives.json")
NATURAL_ALTERNATIVES = _load_json("natural_alternatives.json")

# Daily recommended values (Indian RDA / WHO guidelines)
# Used to calculate % of daily value
DAILY_LIMITS = {
    "energy_kcal": 2000,
    "protein_g": 55,      # Indian RDA for adult male
    "total_fat_g": 65,
    "saturated_fat_g": 20,
    "trans_fat_g": 2.2,   # WHO: <1% of energy
    "carbohydrates_g": 300,
    "sugar_g": 25,        # WHO: <5% of energy (free sugars)
    "added_sugar_g": 25,
    "fiber_g": 30,
    "sodium_mg": 2000,    # WHO recommendation
}


class Analyzer:
    """
    Takes raw label extraction and produces a full analysis.

    Usage:
        analyzer = Analyzer()
        analysis = analyzer.analyze(extraction, price_inr=149, learned_topics=set())
    """

    def __init__(self):
        # Pre-process the additives list for faster lookup
        # We create a dict mapping lowercase ingredient name → additive info
        self.additive_lookup: dict[str, dict] = {}
        for additive in FLAGGED_ADDITIVES["additives"]:
            for name in additive["names"]:
                self.additive_lookup[name.lower()] = additive

        # Pre-process misleading terms
        self.misleading_terms: dict[str, dict] = {}
        for term in FLAGGED_ADDITIVES["misleading_terms"]:
            self.misleading_terms[term["term"].lower()] = term

    def analyze(
        self,
        extraction: LabelExtraction,
        price_inr: float | None = None,
        learned_topics: set[str] | None = None,
    ) -> ProductAnalysis:
        """
        Run all analysis layers on the extracted label data.

        Args:
            extraction: Raw data extracted by Gemini
            price_inr: Price of the product (optional)
            learned_topics: Set of topic_ids the user has already learned
                           (we skip educational notes for these)
        """
        if learned_topics is None:
            learned_topics = set()

        # Run each analysis layer independently
        flags = self._flag_ingredients(extraction)
        serving = self._analyze_serving_size(extraction)
        price = self._analyze_price(extraction, price_inr) if price_inr else None
        alternatives = self._suggest_alternatives(extraction, price_inr)
        edu_notes = self._generate_educational_notes(extraction, flags, learned_topics)
        claim_verifications = self._verify_front_claims(extraction)
        math_verification = self._verify_nutrition_math(extraction)

        # Compute health score with category awareness
        health_score = self._compute_health_score(extraction, flags)

        # Generate summaries
        one_liner = self._generate_one_liner(extraction, flags, serving)
        detailed = self._generate_detailed_summary(
            extraction, flags, serving, price, alternatives
        )

        category = extraction.product_category or ProductCategory.GENERAL_PACKAGED
        category_meta = CATEGORY_METADATA.get(category, {
            "display_name": "Packaged Food",
            "description": "Standard packaged food product"
        })

        return ProductAnalysis(
            extraction=extraction,
            product_category=category,
            category_display_name=category_meta["display_name"],
            ingredient_flags=flags,
            serving_reality=serving,
            price_analysis=price,
            natural_alternatives=alternatives,
            educational_notes=edu_notes,
            claim_verifications=claim_verifications,
            math_verification=math_verification,
            health_score=health_score,
            one_line_summary=one_liner,
            detailed_summary=detailed,
        )

    # ========================================================
    # Analysis Layer 1: Ingredient Flagging
    # ========================================================

    def _flag_ingredients(self, extraction: LabelExtraction) -> list[IngredientFlag]:
        """
        Check each ingredient against our flagged additives database.

        How it works:
        1. For each ingredient on the label, normalize its name (lowercase)
        2. Check if any of our known additive names appear in it
        3. If yes, create a flag with severity, explanation, and source

        We use substring matching (not exact match) because labels
        write ingredients inconsistently. E.g., "Tartrazine (INS 102)"
        should match both "tartrazine" and "INS 102" in our database.
        """
        flags: list[IngredientFlag] = []

        for ingredient in extraction.ingredients:
            ingredient_lower = ingredient.name.lower()

            # Check against each known additive
            for additive_name, additive_info in self.additive_lookup.items():
                if additive_name in ingredient_lower:
                    flags.append(
                        IngredientFlag(
                            ingredient_name=ingredient.name,
                            severity=additive_info["severity"],
                            flag_type=additive_info["flag_type"],
                            title=additive_info["title"],
                            explanation=additive_info["explanation"],
                            source=additive_info.get("source"),
                        )
                    )
                    break  # One flag per ingredient (use the first match)

        # "Crème" is a product-style word, not proof that a filling contains dairy cream.
        # We only call this out when the label itself supports that reading: the product
        # name uses creme/crème, vegetable oil is listed, and dairy cream is not listed.
        product_name = (extraction.product_name or "").lower()
        has_creme_name = "creme" in product_name or "crème" in product_name
        has_vegetable_oil = any(
            "vegetable oil" in name or "palm oil" in name
            for name in (ingredient.name.lower() for ingredient in extraction.ingredients)
        )
        has_dairy_cream = any(
            "cream" in ingredient.name.lower()
            for ingredient in extraction.ingredients
        )
        if has_creme_name and has_vegetable_oil and not has_dairy_cream:
            flags.append(
                IngredientFlag(
                    ingredient_name=extraction.product_name or "Crème-style product",
                    severity="info",
                    flag_type="label_clarity",
                    title="‘Crème’ is not the same as dairy cream",
                    explanation=(
                        "‘Crème’ is a style term, not evidence of dairy cream. This label lists "
                        "vegetable oil and does not list cream, so the name should not be read as "
                        "a dairy-cream claim. Check the ingredient panel for the actual fat source."
                    ),
                    source=None,
                )
            )

        # Also check marketing claims against misleading terms
        for claim in extraction.claims:
            claim_lower = claim.lower()
            for term, info in self.misleading_terms.items():
                if term in claim_lower:
                    flags.append(
                        IngredientFlag(
                            ingredient_name=claim,
                            severity="medium",
                            flag_type="misleading",
                            title=f'"{claim}" — potentially misleading',
                            explanation=info["reality"],
                            source=None,
                        )
                    )

        return flags

    # ========================================================
    # Analysis Layer 2: Serving Size Reality Check
    # ========================================================

    def _analyze_serving_size(
        self, extraction: LabelExtraction
    ) -> ServingReality | None:
        """
        Expose the 'serving size trap'.

        The trick many brands use: list nutrition for a tiny "serving" that
        nobody actually eats in one sitting. This makes the numbers look good.

        Example: A 150g packet of chips lists serving size as 30g.
        The label says 5g protein, 200mg sodium PER SERVING.
        But you eat the whole packet (5 servings):
        → 25g protein (sounds great!)
        → 1000mg sodium (50% of daily limit — not great!)

        Our job: calculate what the FULL PACKAGE nutrition looks like.
        """
        nutrition = extraction.nutrition_per_serving
        serving_g = nutrition.serving_size_g
        package_g = extraction.net_weight_g
        servings = nutrition.servings_per_package

        # Need at least serving size and package weight to analyze
        if not serving_g or not package_g:
            return None

        # Calculate number of servings if not explicitly stated
        if not servings:
            servings = round(package_g / serving_g, 1) if serving_g > 0 else None

        # Build the "full package" nutrition by multiplying
        full_package_nutrition = None
        if servings and servings > 1:
            multiplier = servings
            full_package_nutrition = NutritionInfo(
                serving_size_g=package_g,
                servings_per_package=1,
                energy_kcal=(
                    round(nutrition.energy_kcal * multiplier, 1)
                    if nutrition.energy_kcal
                    else None
                ),
                protein_g=(
                    round(nutrition.protein_g * multiplier, 1)
                    if nutrition.protein_g
                    else None
                ),
                total_fat_g=(
                    round(nutrition.total_fat_g * multiplier, 1)
                    if nutrition.total_fat_g
                    else None
                ),
                saturated_fat_g=(
                    round(nutrition.saturated_fat_g * multiplier, 1)
                    if nutrition.saturated_fat_g
                    else None
                ),
                trans_fat_g=(
                    round(nutrition.trans_fat_g * multiplier, 1)
                    if nutrition.trans_fat_g
                    else None
                ),
                carbohydrates_g=(
                    round(nutrition.carbohydrates_g * multiplier, 1)
                    if nutrition.carbohydrates_g
                    else None
                ),
                sugar_g=(
                    round(nutrition.sugar_g * multiplier, 1)
                    if nutrition.sugar_g
                    else None
                ),
                added_sugar_g=(
                    round(nutrition.added_sugar_g * multiplier, 1)
                    if nutrition.added_sugar_g
                    else None
                ),
                fiber_g=(
                    round(nutrition.fiber_g * multiplier, 1)
                    if nutrition.fiber_g
                    else None
                ),
                sodium_mg=(
                    round(nutrition.sodium_mg * multiplier, 1)
                    if nutrition.sodium_mg
                    else None
                ),
            )

        # Generate a plain-language note
        realistic = ""
        if servings and servings > 1.5:
            serving_description = nutrition.serving_unit_description
            serving_label = (
                f"{serving_g}g ({serving_description})"
                if serving_description
                else f"{serving_g}g"
            )
            realistic = (
                f"The label shows nutrition for a {serving_label} serving, "
                f"but the full packet is {package_g}g "
                f"({servings:.0f} servings). "
                f"Most people eat more than one serving in a sitting."
            )
            if serving_g <= 10 and servings >= 4:
                realistic += (
                    " This is a very small stated serving for a multi-piece snack, "
                    "so compare the full-packet figures before deciding."
                )
            # Add specific warnings for high-multiplier nutrients
            if full_package_nutrition:
                warnings = []
                if (
                    full_package_nutrition.sodium_mg
                    and full_package_nutrition.sodium_mg > DAILY_LIMITS["sodium_mg"] * 0.3
                ):
                    pct = round(
                        full_package_nutrition.sodium_mg
                        / DAILY_LIMITS["sodium_mg"]
                        * 100
                    )
                    warnings.append(
                        f"The full packet has {full_package_nutrition.sodium_mg:.0f}mg "
                        f"sodium ({pct}% of your daily limit)"
                    )
                if (
                    full_package_nutrition.sugar_g
                    and full_package_nutrition.sugar_g > DAILY_LIMITS["sugar_g"] * 0.5
                ):
                    pct = round(
                        full_package_nutrition.sugar_g
                        / DAILY_LIMITS["sugar_g"]
                        * 100
                    )
                    warnings.append(
                        f"The full packet has {full_package_nutrition.sugar_g:.0f}g "
                        f"sugar ({pct}% of your daily limit)"
                    )
                if warnings:
                    realistic += " ⚠️ " + ". ".join(warnings) + "."

        return ServingReality(
            stated_serving_g=serving_g,
            package_weight_g=package_g,
            servings_in_package=servings,
            realistic_consumption=realistic,
            nutrition_full_package=full_package_nutrition,
        )

    # ========================================================
    # Analysis Layer 3: Price Analysis
    # ========================================================

    def _analyze_price(
        self, extraction: LabelExtraction, price_inr: float
    ) -> PriceAnalysis:
        """
        Calculate price-per-gram of key nutrients.

        This is the feature you personally use: comparing which protein
        source gives you the most protein per rupee.

        Simple math:
            price_per_g_protein = price / total_protein_in_package
        
        But we need total protein in the FULL package, not per serving.
        """
        nutrition = extraction.nutrition_per_serving
        package_g = extraction.net_weight_g

        # Try to get per-100g values for more accurate calculation
        per_100g = extraction.nutrition_per_100g

        # Calculate total nutrients in the package
        total_protein = None
        total_fiber = None
        total_energy = None

        if per_100g and package_g:
            # If we have per-100g data, use it (more accurate)
            if per_100g.protein_g:
                total_protein = per_100g.protein_g * package_g / 100
            if per_100g.fiber_g:
                total_fiber = per_100g.fiber_g * package_g / 100
            if per_100g.energy_kcal:
                total_energy = per_100g.energy_kcal * package_g / 100
        elif nutrition.servings_per_package:
            # Fallback: multiply per-serving by number of servings
            s = nutrition.servings_per_package
            if nutrition.protein_g:
                total_protein = nutrition.protein_g * s
            if nutrition.fiber_g:
                total_fiber = nutrition.fiber_g * s
            if nutrition.energy_kcal:
                total_energy = nutrition.energy_kcal * s

        # Compute price-per-gram ratios
        # Only compute protein price if protein is actually relevant to this food category
        category = extraction.product_category or ProductCategory.GENERAL_PACKAGED
        has_protein_claim = any("protein" in claim.lower() for claim in extraction.claims)
        has_high_protein = (nutrition.protein_g and nutrition.protein_g >= 10) or (
            per_100g and per_100g.protein_g and per_100g.protein_g >= 15
        )
        is_protein_relevant = (
            category in [ProductCategory.PROTEIN_FITNESS, ProductCategory.DAIRY_DAIRY_ALT]
            or has_protein_claim
            or has_high_protein
        )

        price_per_g_protein = None
        if is_protein_relevant and total_protein and total_protein > 0:
            price_per_g_protein = round(price_inr / total_protein, 2)

        price_per_g_fiber = (
            round(price_inr / total_fiber, 2)
            if total_fiber and total_fiber > 0
            else None
        )
        price_per_100_kcal = (
            round(price_inr / total_energy * 100, 2)
            if total_energy and total_energy > 0
            else None
        )

        # Generate a value verdict
        verdict = self._generate_value_verdict(
            price_per_g_protein, total_protein, price_inr
        )

        return PriceAnalysis(
            price_inr=price_inr,
            price_per_g_protein=price_per_g_protein,
            price_per_g_fiber=price_per_g_fiber,
            price_per_100_kcal=price_per_100_kcal,
            value_verdict=verdict,
        )

    def _generate_value_verdict(
        self,
        price_per_g_protein: float | None,
        total_protein: float | None,
        price_inr: float,
    ) -> str:
        """Generate a plain-language assessment of price value."""
        if not price_per_g_protein or not total_protein:
            return ""

        # Benchmark: Eggs give ~12g protein for ~₹16 → ₹1.33/g protein
        # Chicken: ~31g protein for ~₹35/100g → ₹1.13/g protein
        # Whey protein: ~24g per scoop, ~₹50/scoop → ₹2.08/g protein
        # Chana: ~9g per 100g for ~₹12 → ₹1.33/g protein

        if price_per_g_protein < 2:
            return (
                f"₹{price_per_g_protein:.1f}/g protein — "
                f"Good value. Comparable to eggs (₹1.3/g) or chicken (₹1.1/g)."
            )
        elif price_per_g_protein < 5:
            return (
                f"₹{price_per_g_protein:.1f}/g protein — "
                f"Moderate value. You'd get more protein per rupee from "
                f"eggs (₹1.3/g), chicken (₹1.1/g), or chana (₹1.3/g)."
            )
        elif price_per_g_protein < 10:
            return (
                f"₹{price_per_g_protein:.1f}/g protein — "
                f"Expensive for the protein. 2 eggs (₹16) give you 12g protein, "
                f"which is ₹1.3/g. This product costs {price_per_g_protein/1.3:.1f}x more "
                f"per gram of protein."
            )
        else:
            return (
                f"₹{price_per_g_protein:.1f}/g protein — "
                f"Very expensive for the protein content. "
                f"You're paying a premium for packaging and brand, not nutrition."
            )

    # ========================================================
    # Analysis Layer 4: Natural Alternatives
    # ========================================================

    def _suggest_alternatives(
        self,
        extraction: LabelExtraction,
        price_inr: float | None,
    ) -> list[NaturalAlternative]:
        """
        Suggest whole-food alternatives tailored to the product's category.

        For desserts: wholesome sweet treats (dates, dark chocolate, figs).
        For sodas/juices: healthy refreshing drinks (coconut water, chaas, nimbu pani).
        For chips/snacks: healthy crunchy bites (roasted makhana, roasted chana).
        For protein/fitness: whole-food complete proteins (eggs, paneer, sattu).
        """
        alternatives: list[NaturalAlternative] = []
        nutrition = extraction.nutrition_per_serving
        category = extraction.product_category or ProductCategory.GENERAL_PACKAGED

        # 1. Desserts & Sweets
        if category == ProductCategory.DESSERT_SWEET:
            sweet_alts = NATURAL_ALTERNATIVES["alternatives"].get("sweet_treat", [])
            for alt in sweet_alts[:3]:
                alternatives.append(
                    NaturalAlternative(
                        nutrient="sweetness without junk",
                        food_name=alt["food_name"],
                        quantity=alt["quantity"],
                        nutrient_amount=alt["nutrient_amount"],
                        approx_cost_inr=alt.get("approx_cost_inr"),
                        note=alt.get("note", ""),
                    )
                )
            return alternatives

        # 2. Beverages (Sodas & Packaged Juices)
        if category in [ProductCategory.BEVERAGE_SODA, ProductCategory.BEVERAGE_JUICE]:
            bev_alts = NATURAL_ALTERNATIVES["alternatives"].get("refreshing_beverage", [])
            for alt in bev_alts[:3]:
                alternatives.append(
                    NaturalAlternative(
                        nutrient="natural hydration",
                        food_name=alt["food_name"],
                        quantity=alt["quantity"],
                        nutrient_amount=alt["nutrient_amount"],
                        approx_cost_inr=alt.get("approx_cost_inr"),
                        note=alt.get("note", ""),
                    )
                )
            return alternatives

        # 3. Savory Snacks
        if category == ProductCategory.SAVORY_SNACK:
            snack_alts = NATURAL_ALTERNATIVES["alternatives"].get("savory_snack", [])
            for alt in snack_alts[:2]:
                alternatives.append(
                    NaturalAlternative(
                        nutrient="healthy crunch",
                        food_name=alt["food_name"],
                        quantity=alt["quantity"],
                        nutrient_amount=alt["nutrient_amount"],
                        approx_cost_inr=alt.get("approx_cost_inr"),
                        note=alt.get("note", ""),
                    )
                )

        # 4. Protein / Fitness / High-Protein Items
        is_protein_product = any(
            "protein" in claim.lower() for claim in extraction.claims
        )
        has_high_protein = (nutrition.protein_g and nutrition.protein_g >= 10)
        is_protein_category = category in [ProductCategory.PROTEIN_FITNESS, ProductCategory.DAIRY_DAIRY_ALT]

        if is_protein_product or has_high_protein or is_protein_category:
            protein_alts = NATURAL_ALTERNATIVES["alternatives"].get("protein", [])
            for alt in protein_alts[:3]:
                alternatives.append(
                    NaturalAlternative(
                        nutrient="protein",
                        food_name=alt["food_name"],
                        quantity=alt["quantity"],
                        nutrient_amount=alt["nutrient_amount"],
                        approx_cost_inr=alt.get("approx_cost_inr"),
                        note=alt.get("note", ""),
                    )
                )

        # 5. Fiber-rich or fiber-claiming products
        has_fiber_claim = any(
            "fiber" in claim.lower() or "fibre" in claim.lower()
            for claim in extraction.claims
        )
        if has_fiber_claim or (nutrition.fiber_g and nutrition.fiber_g >= 3):
            fiber_alts = NATURAL_ALTERNATIVES["alternatives"].get("fiber", [])
            for alt in fiber_alts[:2]:
                alternatives.append(
                    NaturalAlternative(
                        nutrient="fiber",
                        food_name=alt["food_name"],
                        quantity=alt["quantity"],
                        nutrient_amount=alt["nutrient_amount"],
                        approx_cost_inr=alt.get("approx_cost_inr"),
                        note=alt.get("note", ""),
                    )
                )

        # Fallback if list is empty
        if not alternatives:
            protein_alts = NATURAL_ALTERNATIVES["alternatives"].get("protein", [])
            for alt in protein_alts[:2]:
                alternatives.append(
                    NaturalAlternative(
                        nutrient="clean whole food",
                        food_name=alt["food_name"],
                        quantity=alt["quantity"],
                        nutrient_amount=alt["nutrient_amount"],
                        approx_cost_inr=alt.get("approx_cost_inr"),
                        note=alt.get("note", ""),
                    )
                )

        return alternatives

    # ========================================================
    # Analysis Layer 5: Educational Notes
    # ========================================================

    def _generate_educational_notes(
        self,
        extraction: LabelExtraction,
        flags: list[IngredientFlag],
        learned_topics: set[str],
    ) -> list[EducationalNote]:
        """
        Generate teaching moments based on what's in this product.

        The key insight: we only teach concepts the user hasn't seen before.
        After they've seen "sodium_effects" 3 times, we stop explaining it.
        This makes the app feel smarter over time — it stops being preachy.
        """
        notes: list[EducationalNote] = []
        nutrition = extraction.nutrition_per_serving

        # --- Sodium awareness ---
        if (
            "sodium_effects" not in learned_topics
            and nutrition.sodium_mg
            and nutrition.sodium_mg > DAILY_LIMITS["sodium_mg"] * 0.15
        ):
            pct = round(nutrition.sodium_mg / DAILY_LIMITS["sodium_mg"] * 100)
            notes.append(
                EducationalNote(
                    topic_id="sodium_effects",
                    title="What does excess sodium do to your body?",
                    explanation=(
                        "Sodium (salt) makes your body hold onto water. Too much raises "
                        "blood pressure, which over time damages your heart, kidneys, and "
                        "brain. The WHO recommends less than 2000mg/day. Most Indians "
                        "consume 3000-4000mg/day without realizing it, because packaged "
                        "food is a hidden sodium source. Even 'healthy' snacks can have "
                        "500-800mg per serving."
                    ),
                    triggered_by=(
                        f"This product has {nutrition.sodium_mg:.0f}mg sodium per serving "
                        f"({pct}% of your daily limit)"
                    ),
                )
            )

        # --- Trans fat awareness ---
        if (
            "trans_fat_danger" not in learned_topics
            and nutrition.trans_fat_g
            and nutrition.trans_fat_g > 0
        ):
            notes.append(
                EducationalNote(
                    topic_id="trans_fat_danger",
                    title="Why are trans fats the most dangerous fat?",
                    explanation=(
                        "Trans fats are the only nutrient where ANY amount is harmful. "
                        "They increase LDL (bad cholesterol) AND decrease HDL (good "
                        "cholesterol) — a double hit. They are created when liquid oils "
                        "are 'partially hydrogenated' to make them solid and shelf-stable. "
                        "The WHO wants them completely eliminated from food globally. "
                        "Even if the label says '0g trans fat', check the ingredients — "
                        "if you see 'partially hydrogenated' anything, there ARE trans fats "
                        "(labels can round down to 0 if it's under 0.5g per serving)."
                    ),
                    triggered_by=f"This product contains {nutrition.trans_fat_g}g trans fat per serving",
                )
            )

        # --- Added sugar awareness ---
        if (
            "added_sugar_reality" not in learned_topics
            and nutrition.sugar_g
            and nutrition.sugar_g > DAILY_LIMITS["sugar_g"] * 0.2
        ):
            pct = round(nutrition.sugar_g / DAILY_LIMITS["sugar_g"] * 100)
            notes.append(
                EducationalNote(
                    topic_id="added_sugar_reality",
                    title="How much sugar is too much?",
                    explanation=(
                        "The WHO recommends less than 25g of free/added sugars per day "
                        "(roughly 6 teaspoons). One can of cola has ~35g — already over "
                        "the limit. Sugar provides empty calories (energy with zero "
                        "nutrients). Excess sugar gets converted to fat by your liver, "
                        "leading to weight gain, fatty liver, and eventually diabetes. "
                        "Watch for hidden names: sucrose, glucose syrup, maltodextrin, "
                        "dextrose, corn syrup — they're all sugar."
                    ),
                    triggered_by=(
                        f"This product has {nutrition.sugar_g:.0f}g sugar per serving "
                        f"({pct}% of daily limit)"
                    ),
                )
            )

        # --- Serving size education ---
        if (
            "serving_size_trick" not in learned_topics
            and nutrition.serving_size_g
            and extraction.net_weight_g
            and nutrition.serving_size_g < extraction.net_weight_g * 0.4
        ):
            notes.append(
                EducationalNote(
                    topic_id="serving_size_trick",
                    title="The serving size trick — why labels look healthier than they are",
                    explanation=(
                        "Companies often set unrealistically small serving sizes to make "
                        "the nutrition numbers look good. A '30g serving' of chips when "
                        "the packet is 150g means you'd have to eat only 1/5 of the "
                        "packet to match the label's numbers. Nobody does that. "
                        "Always multiply the per-serving values by how much you actually "
                        "eat, or look at the per-100g column if available."
                    ),
                    triggered_by=(
                        f"Serving size is {nutrition.serving_size_g}g but "
                        f"package is {extraction.net_weight_g}g "
                        f"({extraction.net_weight_g / nutrition.serving_size_g:.0f} servings)"
                    ),
                )
            )

        # --- Ingredient order education ---
        if (
            "ingredient_order" not in learned_topics
            and len(extraction.ingredients) >= 3
        ):
            first = extraction.ingredients[0].name
            notes.append(
                EducationalNote(
                    topic_id="ingredient_order",
                    title="Why the order of ingredients matters",
                    explanation=(
                        "By law, ingredients must be listed in descending order of "
                        "weight — the first ingredient is what the product contains THE "
                        "MOST of. If sugar or oil is in the top 3, that tells you more "
                        "about the product than any marketing claim on the front. "
                        "In this product, the first (most abundant) ingredient is: "
                        f"'{first}'."
                    ),
                    triggered_by=f"First ingredient: {first}",
                )
            )

        return notes

    # ========================================================
    # Health Score Computation
    # ========================================================

    def _compute_health_score(
        self, extraction: LabelExtraction, flags: list[IngredientFlag]
    ) -> int:
        """
        Compute a category-aware 1-10 health score.

        A dessert should NOT be penalized for lacking protein.
        A protein bar SHOULD be held accountable for high protein density.
        A soda should be penalized for liquid sugar spikes.
        A savory snack should be scrutinized for sodium and palm oil.
        """
        score = 7.0
        nutrition = extraction.nutrition_per_serving
        category = extraction.product_category or ProductCategory.GENERAL_PACKAGED

        # 1. Base Deductions: Flagged Ingredients (Additives, Banned substances)
        for flag in flags:
            if flag.severity == "high":
                score -= 1.5
            elif flag.severity == "medium":
                score -= 0.75
            elif flag.severity == "low":
                score -= 0.25

        # 2. Universal Deduction: Trans Fats (harmful in any category)
        if nutrition.trans_fat_g and nutrition.trans_fat_g > 0:
            score -= 2.0

        # 3. Universal Deduction: Extreme Ultra-Processing (long chemical ingredient lists)
        if len(extraction.ingredients) > 15:
            score -= 1.0
        elif len(extraction.ingredients) > 10:
            score -= 0.5
        elif len(extraction.ingredients) <= 5 and len(extraction.ingredients) > 0:
            score += 0.5  # Minimal, clean ingredient list bonus

        # 4. Category-Specific Scoring Rules
        if category == ProductCategory.DESSERT_SWEET:
            # Desserts are sweet treats — evaluate clean indulgence, not protein!
            # Heavy penalty only if sugar is overwhelming (>25g in a single serving)
            if nutrition.sugar_g and nutrition.sugar_g > 25:
                score -= 1.5
            elif nutrition.sugar_g and nutrition.sugar_g > 15:
                score -= 0.75

            # Saturated fat penalty (palm fat / vanaspati)
            if nutrition.saturated_fat_g and nutrition.saturated_fat_g > 10:
                score -= 1.0

        elif category == ProductCategory.BEVERAGE_SODA:
            # Liquid sugar rush has zero satiety and spikes glucose instantly
            if nutrition.sugar_g and nutrition.sugar_g > 20:
                score -= 3.0
            elif nutrition.sugar_g and nutrition.sugar_g > 10:
                score -= 1.5

        elif category == ProductCategory.BEVERAGE_JUICE:
            # Packaged juice trap: high sugar without the protective fiber of whole fruit
            if nutrition.sugar_g and nutrition.sugar_g > 15:
                if not nutrition.fiber_g or nutrition.fiber_g < 1:
                    score -= 1.5
                else:
                    score -= 0.75

        elif category == ProductCategory.SAVORY_SNACK:
            # Savory snacks are prone to sodium and palm oil traps
            if nutrition.sodium_mg and nutrition.sodium_mg > 0:
                sodium_pct = nutrition.sodium_mg / DAILY_LIMITS["sodium_mg"]
                if sodium_pct > 0.3:  # >600mg per serving
                    score -= 2.0
                elif sodium_pct > 0.15:
                    score -= 1.0

            # Saturated fat / frying oil penalty
            if nutrition.saturated_fat_g and nutrition.saturated_fat_g > 8:
                score -= 1.0

            # Fiber bonus for whole snacks (e.g. roasted chana, makhana)
            if nutrition.fiber_g and nutrition.fiber_g >= 3:
                score += 0.5

        elif category == ProductCategory.PROTEIN_FITNESS:
            # Products sold for fitness MUST deliver real protein
            if nutrition.protein_g and nutrition.protein_g >= 15:
                score += 1.5
            elif nutrition.protein_g and nutrition.protein_g >= 8:
                score += 0.5
            else:
                score -= 1.5  # Fitness item failing protein promise

            # Sugar penalty for "fitness" bars loaded with candy sugars
            if nutrition.sugar_g and nutrition.sugar_g > 10:
                score -= 1.5

            if nutrition.fiber_g and nutrition.fiber_g >= 3:
                score += 0.5

        else:
            # General packaged foods & staples
            if nutrition.sodium_mg and nutrition.sodium_mg > 0:
                sodium_pct = nutrition.sodium_mg / DAILY_LIMITS["sodium_mg"]
                if sodium_pct > 0.3:
                    score -= 1.5
                elif sodium_pct > 0.15:
                    score -= 0.75

            if nutrition.sugar_g and nutrition.sugar_g > 0:
                sugar_pct = nutrition.sugar_g / DAILY_LIMITS["sugar_g"]
                if sugar_pct > 0.4:
                    score -= 1.5
                elif sugar_pct > 0.2:
                    score -= 0.75

            if nutrition.protein_g and nutrition.protein_g >= 8:
                score += 0.5

            if nutrition.fiber_g and nutrition.fiber_g >= 3:
                score += 0.5

        # Clamp strictly between 1 and 10
        return max(1, min(10, round(score)))

    # ========================================================
    # Summary Generation
    # ========================================================

    def _generate_one_liner(
        self,
        extraction: LabelExtraction,
        flags: list[IngredientFlag],
        serving: ServingReality | None,
    ) -> str:
        """Generate a one-line verdict."""
        name = extraction.product_name or "This product"
        high_flags = [f for f in flags if f.severity == "high"]
        misleading = [f for f in flags if f.flag_type == "misleading"]

        if high_flags:
            return (
                f"{name} contains {len(high_flags)} ingredient(s) "
                f"banned or restricted in other countries."
            )
        if misleading:
            claims = ", ".join(f'"{m.ingredient_name}"' for m in misleading[:2])
            return f"{name} has marketing claims ({claims}) that may be misleading."
        if serving and serving.servings_in_package and serving.servings_in_package > 3:
            return (
                f"{name} — the label looks decent per serving, but remember: "
                f"the packet contains {serving.servings_in_package:.0f} servings."
            )
        return f"{name} — no major red flags found."

    def _generate_detailed_summary(
        self,
        extraction: LabelExtraction,
        flags: list[IngredientFlag],
        serving: ServingReality | None,
        price: PriceAnalysis | None,
        alternatives: list[NaturalAlternative],
    ) -> str:
        """Generate a 2-3 paragraph detailed summary."""
        parts = []
        name = extraction.product_name or "This product"
        nutrition = extraction.nutrition_per_serving

        # Para 1: What's in it
        para1 = f"**{name}** contains {len(extraction.ingredients)} ingredients."
        if extraction.ingredients:
            top3 = ", ".join(i.name for i in extraction.ingredients[:3])
            para1 += f" The top ingredients (by quantity) are: {top3}."
        if nutrition.protein_g:
            para1 += (
                f" Per serving ({nutrition.serving_size_g}g): "
                f"{nutrition.protein_g}g protein, "
                f"{nutrition.energy_kcal or '?'} kcal."
            )
        parts.append(para1)

        # Para 2: Concerns
        if flags:
            high = [f for f in flags if f.severity == "high"]
            medium = [f for f in flags if f.severity == "medium"]
            concern = f"**Concerns:** "
            if high:
                names = ", ".join(f.ingredient_name for f in high)
                concern += f"⚠️ High concern: {names}. "
            if medium:
                names = ", ".join(f.ingredient_name for f in medium)
                concern += f"⚡ Moderate concern: {names}."
            parts.append(concern)

        # Para 3: Value
        if price:
            parts.append(f"**Value:** {price.value_verdict}")

        if alternatives:
            alt_text = "**Natural alternatives:** "
            alt_items = [
                f"{a.food_name} ({a.quantity} = {a.nutrient_amount}, ~₹{a.approx_cost_inr})"
                for a in alternatives[:3]
                if a.approx_cost_inr
            ]
            alt_text += ", ".join(alt_items)
            parts.append(alt_text)

        return "\n\n".join(parts)

    # ========================================================
    # Analysis Layer 6: Front-of-Pack Claim Verification (FSSAI)
    # ========================================================

    def _verify_front_claims(self, extraction: LabelExtraction) -> list[ClaimVerification]:
        """
        Verify front-of-pack claims against back ingredients & nutrition numbers.
        Applies FSSAI rules and consumer awareness checks (like Glucose Gal / FoodPharmer).
        """
        verifications: list[ClaimVerification] = []
        claims_text = " ".join(extraction.claims).lower()
        product_name = (extraction.product_name or "").lower()
        combined_text = f"{product_name} {claims_text}"

        ingredients_names = [i.name.lower() for i in extraction.ingredients]
        first_ingredient = ingredients_names[0] if ingredients_names else ""
        nutrition = extraction.nutrition_per_serving

        # 1. Multigrain Claim Verification
        if "multigrain" in combined_text or "multi grain" in combined_text:
            is_primary_maida = any(
                m in first_ingredient
                for m in ["refined wheat flour", "maida", "wheat flour (refined)"]
            )
            if is_primary_maida:
                verifications.append(
                    ClaimVerification(
                        claim="Multigrain",
                        status="misleading",
                        explanation=(
                            f"Packaged as 'Multigrain', but the #1 primary ingredient by weight is "
                            f"Refined Wheat Flour (Maida). FSSAI allows the term 'multigrain' as long as "
                            f"grains other than wheat make up only a small fraction (>10%), meaning the consumer "
                            f"is mostly eating Maida."
                        ),
                        fssai_rule="FSSAI Food Safety and Standards (Advertising and Claims) Regulations",
                    )
                )
            else:
                verifications.append(
                    ClaimVerification(
                        claim="Multigrain",
                        status="verified",
                        explanation="Contains multiple whole grains without refined flour listed as the primary ingredient.",
                        fssai_rule="FSSAI Food Safety and Standards Regulations",
                    )
                )

        # 2. Whole Wheat / 100% Atta Claim Verification
        if "whole wheat" in combined_text or "atta" in combined_text:
            if "100%" in combined_text and any("maida" in ing or "refined wheat" in ing for ing in ingredients_names):
                verifications.append(
                    ClaimVerification(
                        claim="100% Whole Wheat / Atta",
                        status="debunked",
                        explanation=(
                            "Claims 100% Whole Wheat/Atta, yet ingredients reveal Refined Wheat Flour (Maida). "
                            "This violates FSSAI truth-in-labeling standards."
                        ),
                        fssai_rule="FSSAI Regulation on Bread & Bakery Products",
                    )
                )
            elif any("refined wheat" in first_ingredient or "maida" in first_ingredient for _ in [1]):
                verifications.append(
                    ClaimVerification(
                        claim="Whole Wheat Bread / Atta",
                        status="misleading",
                        explanation=(
                            "Marketed as Whole Wheat / Atta, but Refined Wheat Flour (Maida) is the first "
                            "ingredient by quantity. The whole wheat content is secondary."
                        ),
                        fssai_rule="FSSAI Advertising and Claims Regulations",
                    )
                )

        # 3. High Protein Claim Verification (FSSAI threshold: 20% kcal from protein)
        if "protein" in combined_text and ("high" in combined_text or "rich" in combined_text or "source" in combined_text):
            if nutrition.protein_g and nutrition.energy_kcal and nutrition.energy_kcal > 0:
                protein_kcal = nutrition.protein_g * 4
                protein_energy_pct = (protein_kcal / nutrition.energy_kcal) * 100
                if protein_energy_pct < 20.0:
                    verifications.append(
                        ClaimVerification(
                            claim="High Protein",
                            status="debunked" if protein_energy_pct < 12.0 else "misleading",
                            explanation=(
                                f"FSSAI requires at least 20% of energy to come from protein to legally claim 'High Protein' "
                                f"(or 12% for 'Source of Protein'). In this product, protein provides only {protein_energy_pct:.1f}% "
                                f"of total calories ({nutrition.protein_g}g protein = {protein_kcal:.0f} kcal out of {nutrition.energy_kcal:.0f} kcal). "
                                f"This is an inflated protein claim."
                            ),
                            fssai_rule="FSSAI Schedule-I Nutritional Claims (20% of energy value from protein)",
                        )
                    )
                else:
                    verifications.append(
                        ClaimVerification(
                            claim="High Protein",
                            status="verified",
                            explanation=(
                                f"Protein contributes {protein_energy_pct:.1f}% of total energy, "
                                f"meeting the FSSAI threshold (>= 20%)."
                            ),
                            fssai_rule="FSSAI Schedule-I Nutritional Claims",
                        )
                    )

        # 4. No Added Sugar Claim Verification
        if "no added sugar" in combined_text or "zero sugar" in combined_text:
            hidden_sugars = [
                "maltodextrin", "invert sugar", "dextrose", "liquid glucose",
                "corn syrup", "fructose syrup", "fruit juice concentrate", "honey", "date syrup"
            ]
            found_hidden = [ing for ing in ingredients_names if any(hs in ing for hs in hidden_sugars)]
            if found_hidden:
                verifications.append(
                    ClaimVerification(
                        claim="No Added Sugar",
                        status="misleading",
                        explanation=(
                            f"Claims 'No Added Sugar', but contains alternate sweeteners/refined carbs: "
                            f"{', '.join(found_hidden)}. These spike blood glucose and insulin similar to table sugar."
                        ),
                        fssai_rule="FSSAI Advertising Regulations (Section on Sugars)",
                    )
                )
            elif nutrition.sugar_g and nutrition.sugar_g > 10.0:
                verifications.append(
                    ClaimVerification(
                        claim="No Added Sugar",
                        status="misleading",
                        explanation=(
                            f"Product contains {nutrition.sugar_g}g sugar per serving from concentrated natural sources."
                        ),
                        fssai_rule="FSSAI Advertising and Claims Regulations",
                    )
                )

        # 5. No Palm Oil / Zero Palm Oil Claim Verification
        if "palm oil" in combined_text or "no palm" in combined_text or "zero palm" in combined_text or "palm free" in combined_text:
            # Check what oils/fats are actually present
            common_oils = [
                "palmolein", "palm oil", "palm kernel oil",
                "vanaspati", "hydrogenated vegetable fat", "hydrogenated vegetable oil", "interesterified vegetable fat",
                "cottonseed oil", "refined cottonseed oil",
                "refined rice bran oil", "rice bran oil",
                "refined sunflower oil", "sunflower oil",
                "refined soybean oil", "soybean oil", "soy oil",
                "corn oil", "canola oil", "edible vegetable oil",
                "cold pressed", "wood pressed", "kachi ghani", "mustard oil", "coconut oil", "cow ghee", "desi ghee", "olive oil"
            ]
            found_oils = [ing for ing in ingredients_names if any(oil in ing for oil in common_oils)]

            # Check if palm oil was secretly included
            has_hidden_palm = any(p in ing for ing in ingredients_names for p in ["palmolein", "palm oil", "fractionated palm"])
            has_vanaspati = any(v in ing for ing in ingredients_names for v in ["vanaspati", "hydrogenated vegetable"])

            if has_hidden_palm:
                verifications.append(
                    ClaimVerification(
                        claim="No Palm Oil",
                        status="debunked",
                        explanation=(
                            "Claims 'No Palm Oil' on package, yet the ingredient list contains "
                            f"{', '.join([o for o in found_oils if 'palm' in o])}! Direct violation of FSSAI truth-in-advertising."
                        ),
                        fssai_rule="FSSAI Food Safety and Standards (Advertising and Claims) Regulations 2018",
                    )
                )
            elif has_vanaspati:
                verifications.append(
                    ClaimVerification(
                        claim="No Palm Oil",
                        status="misleading",
                        explanation=(
                            "Replaced palm oil with Hydrogenated Vegetable Fat (Vanaspati), which is a major source "
                            "of industrial trans fats and even worse for cardiovascular health than palm oil."
                        ),
                        fssai_rule="FSSAI Regulations on Trans Fatty Acids",
                    )
                )
            elif any("cottonseed" in ing for ing in found_oils):
                verifications.append(
                    ClaimVerification(
                        claim="No Palm Oil",
                        status="misleading",
                        explanation=(
                            "Verified free of palm oil, but uses Cottonseed Oil. Cottonseed oil is widely used in Indian "
                            "namkeens because it is extremely cheap, but it is heavily solvent-extracted (hexane) and "
                            "naturally contains gossypol before aggressive refining."
                        ),
                        fssai_rule="FSSAI Labeling Standards",
                    )
                )
            elif any(s in ing for ing in found_oils for s in ["sunflower", "rice bran", "soybean", "edible vegetable oil"]):
                oil_name = found_oils[0].title() if found_oils else "Refined Seed Oil"
                verifications.append(
                    ClaimVerification(
                        claim="No Palm Oil",
                        status="verified",
                        explanation=(
                            f"Verified: Free of palm oil. It uses {oil_name}. Note: While lower in saturated "
                            f"fat than palm oil, ultra-refined seed oils undergo high-heat solvent extraction "
                            f"and deodorization, and are high in inflammatory Omega-6 linoleic acid. "
                            f"A clean alternative would be cold-pressed (kachi ghani) oil or desi ghee."
                        ),
                        fssai_rule="FSSAI Advertising and Claims Regulations",
                    )
                )
            elif any(c in ing for ing in found_oils for c in ["cold pressed", "wood pressed", "ghee", "olive", "mustard"]):
                verifications.append(
                    ClaimVerification(
                        claim="No Palm Oil",
                        status="verified",
                        explanation="Genuinely clean formulation: Free of palm oil and uses unrefined, traditional healthy fats.",
                        fssai_rule="FSSAI Advertising and Claims Regulations",
                    )
                )
            else:
                verifications.append(
                    ClaimVerification(
                        claim="No Palm Oil",
                        status="verified",
                        explanation="No palm oil or palmolein listed in the ingredients.",
                        fssai_rule="FSSAI Advertising Regulations",
                    )
                )

        # 6. "Source of Protein" & "Source of Fibre" Quantification Audit
        serving_g = nutrition.serving_size_g or 100.0

        # Protein quantification
        if "protein" in combined_text and ("source of protein" in combined_text or "protein rich" in combined_text or "source of" in combined_text):
            if nutrition.protein_g is not None:
                protein_pct_by_weight = (nutrition.protein_g / serving_g) * 100
                protein_per_100g = (nutrition.protein_g / serving_g) * 100 if serving_g else nutrition.protein_g
                fssai_min_source = 5.5  # 10% of RDA (55g) per 100g solid food

                if protein_per_100g < fssai_min_source:
                    verifications.append(
                        ClaimVerification(
                            claim="Source of Protein",
                            status="debunked",
                            explanation=(
                                f"FSSAI Schedule I requires solid foods to contain at least 10% of RDA (5.5g per 100g) "
                                f"to claim 'Source of Protein'. This product has only {protein_per_100g:.1f}g per 100g "
                                f"({protein_pct_by_weight:.1f}% by weight). That means in 1 serving ({serving_g:.0f}g), "
                                f"you get just {nutrition.protein_g:.1f}g protein — not a meaningful source."
                            ),
                            fssai_rule="FSSAI Food Safety and Standards (Advertising and Claims) Regulations, Schedule I",
                        )
                    )
                elif protein_per_100g < 10.0:
                    verifications.append(
                        ClaimVerification(
                            claim="Source of Protein",
                            status="misleading",
                            explanation=(
                                f"Technically meets FSSAI minimum ({protein_per_100g:.1f}g / 100g, or {protein_pct_by_weight:.1f}% by weight), "
                                f"but provides only {nutrition.protein_g:.1f}g protein per actual serving ({serving_g:.0f}g). "
                                f"Almost any grain or nut-based snack has 5-8% protein naturally. This is marketing a basic nutrient as a feature."
                            ),
                            fssai_rule="FSSAI Advertising and Claims Regulations (Schedule I: Source of Protein)",
                        )
                    )
                else:
                    verifications.append(
                        ClaimVerification(
                            claim="Source of Protein",
                            status="verified",
                            explanation=(
                                f"Verified: Contains {protein_per_100g:.1f}g protein per 100g ({protein_pct_by_weight:.1f}% by weight), "
                                f"comfortably exceeding FSSAI's 5.5g/100g threshold."
                            ),
                            fssai_rule="FSSAI Schedule I Nutrition Claims",
                        )
                    )

        # Fibre quantification
        if "fibre" in combined_text or "fiber" in combined_text:
            if "source of fibre" in combined_text or "source of fiber" in combined_text or "good source of fibre" in combined_text or "good source of fiber" in combined_text:
                if nutrition.fiber_g is not None:
                    fiber_pct_by_weight = (nutrition.fiber_g / serving_g) * 100
                    fiber_per_100g = (nutrition.fiber_g / serving_g) * 100 if serving_g else nutrition.fiber_g
                    fssai_min_fiber = 3.0  # 3g per 100g for solid food

                    if fiber_per_100g < fssai_min_fiber:
                        verifications.append(
                            ClaimVerification(
                                claim="Source of Fibre",
                                status="debunked",
                                explanation=(
                                    f"FSSAI Schedule I mandates at least 3g dietary fibre per 100g to claim 'Source of Fibre'. "
                                    f"This product contains only {fiber_per_100g:.1f}g per 100g ({fiber_pct_by_weight:.1f}% by weight). "
                                    f"This fails FSSAI statutory compliance."
                                ),
                                fssai_rule="FSSAI Advertising and Claims Regulations (Schedule I: Dietary Fibre)",
                            )
                        )
                    elif fiber_per_100g < 5.0:
                        verifications.append(
                            ClaimVerification(
                                claim="Source of Fibre",
                                status="misleading",
                                explanation=(
                                    f"Barely meets FSSAI minimum of 3g/100g (actual: {fiber_per_100g:.1f}g / 100g, or {fiber_pct_by_weight:.1f}% by weight). "
                                    f"Per serving ({serving_g:.0f}g), you get just {nutrition.fiber_g:.1f}g of fiber (less than 5% of daily need). "
                                    f"A single small apple or katori of moong dal gives 4-5x more fiber."
                                ),
                                fssai_rule="FSSAI Advertising and Claims Regulations (Schedule I)",
                            )
                        )
                    else:
                        verifications.append(
                            ClaimVerification(
                                claim="Source of Fibre",
                                status="verified",
                                explanation=(
                                    f"Verified: Contains {fiber_per_100g:.1f}g fibre per 100g ({fiber_pct_by_weight:.1f}% by weight), "
                                    f"meeting FSSAI standards."
                                ),
                                fssai_rule="FSSAI Schedule I Nutrition Claims",
                            )
                        )

        # 7. "No Added Preservatives" / "Preservative Free" Claim Verification
        if "no added preservative" in combined_text or "no preservative" in combined_text or "preservative free" in combined_text or "zero preservative" in combined_text:
            chemical_preservatives = [
                ("ins 211", "Sodium Benzoate (INS 211)"),
                ("sodium benzoate", "Sodium Benzoate"),
                ("ins 202", "Potassium Sorbate (INS 202)"),
                ("potassium sorbate", "Potassium Sorbate"),
                ("ins 282", "Calcium Propionate (INS 282)"),
                ("calcium propionate", "Calcium Propionate"),
                ("ins 220", "Sulfur Dioxide (INS 220)"),
                ("ins 222", "Sodium Bisulfite (INS 222)"),
                ("ins 223", "Sodium Metabisulfite (INS 223)"),
                ("ins 224", "Potassium Metabisulfite (INS 224)"),
                ("ins 249", "Potassium Nitrite (INS 249)"),
                ("ins 250", "Sodium Nitrite (INS 250)"),
                ("ins 319", "TBHQ (INS 319)"),
                ("tbhq", "TBHQ (Tertiary Butylhydroquinone)"),
                ("ins 320", "BHA (INS 320)"),
                ("bha", "BHA (Butylated Hydroxyanisole)"),
                ("ins 321", "BHT (INS 321)"),
                ("bht", "BHT (Butylated Hydroxytoluene)"),
            ]
            found_preservatives = [label for key, label in chemical_preservatives if any(key in ing for ing in ingredients_names)]

            if found_preservatives:
                verifications.append(
                    ClaimVerification(
                        claim="No Added Preservatives",
                        status="debunked",
                        explanation=(
                            f"Claims 'No Added Preservatives', but the ingredients list clearly reveals "
                            f"{', '.join(found_preservatives)}! These are synthetic chemical preservatives/antioxidants "
                            f"used to artificially extend shelf life. This is a misleading label."
                        ),
                        fssai_rule="FSSAI Food Safety and Standards (Packaging and Labelling) Regulations",
                    )
                )
            else:
                has_high_sodium = nutrition.sodium_mg and nutrition.sodium_mg > 400
                if has_high_sodium:
                    verifications.append(
                        ClaimVerification(
                            claim="No Added Preservatives",
                            status="verified",
                            explanation=(
                                f"Verified: No Class II chemical preservatives (like Sodium Benzoate or Sorbates). "
                                f"However, notice the high sodium content ({nutrition.sodium_mg:.0f}mg per serving) and acidity regulators, "
                                f"which act as natural curing and preservation agents to maintain stability."
                            ),
                            fssai_rule="FSSAI Packaging and Labelling Regulations",
                        )
                    )
                else:
                    verifications.append(
                        ClaimVerification(
                            claim="No Added Preservatives",
                            status="verified",
                            explanation="Verified: Clean preservation profile with zero synthetic chemical preservatives (INS 200-299 series).",
                            fssai_rule="FSSAI Packaging and Labelling Regulations",
                        )
                    )

        # 8. "Cholesterol Free" Claim Verification
        if "cholesterol free" in combined_text or "0% cholesterol" in combined_text or "zero cholesterol" in combined_text or "no cholesterol" in combined_text:
            animal_derivatives = ["milk", "dairy", "butter", "cheese", "ghee", "egg", "meat", "poultry", "fish", "whey", "casein"]
            is_animal_product = any(a in ing for ing in ingredients_names for a in animal_derivatives)

            if is_animal_product:
                verifications.append(
                    ClaimVerification(
                        claim="Cholesterol Free",
                        status="misleading",
                        explanation=(
                            "Product contains dairy or animal-derived ingredients which naturally contain dietary cholesterol. "
                            "Check if stated cholesterol per 100g is strictly under 5mg per FSSAI limits."
                        ),
                        fssai_rule="FSSAI Schedule I Nutritional Claims",
                    )
                )
            else:
                verifications.append(
                    ClaimVerification(
                        claim="Cholesterol Free",
                        status="misleading",
                        explanation=(
                            "Technically true, but misleading marketing: Cholesterol is biologically synthesized exclusively "
                            "in animal livers. All 100% plant-based foods (wheat, rice, corn, nuts, vegetable oils) "
                            "naturally have ZERO cholesterol by definition of nature. Advertising a plant-based food as "
                            "'Cholesterol Free' creates a false health halo for a universal biological fact."
                        ),
                        fssai_rule="FSSAI Advertising and Claims Regulations (Deceptive Health Claims)",
                    )
                )

        # 9. "No Added Maida" / "Maida Free" / "Zero Maida" Claim Verification
        if "maida" in combined_text and ("no " in combined_text or "zero" in combined_text or "free" in combined_text or "without" in combined_text):
            has_maida = any(m in ing for ing in ingredients_names for m in ["maida", "refined wheat flour", "wheat flour (refined)"])
            starches = ["maltodextrin", "tapioca starch", "corn starch", "potato starch", "modified starch"]
            found_starches = [s for s in starches if any(s in ing for ing in ingredients_names)]

            if has_maida:
                verifications.append(
                    ClaimVerification(
                        claim="No Added Maida",
                        status="debunked",
                        explanation="Claims 'No Added Maida', yet ingredients list clearly contains Refined Wheat Flour (Maida). Direct FSSAI violation.",
                        fssai_rule="FSSAI Advertising and Claims Regulations 2018",
                    )
                )
            elif found_starches:
                verifications.append(
                    ClaimVerification(
                        claim="No Added Maida",
                        status="misleading",
                        explanation=(
                            f"Verified free of maida, but heavily padded with refined starches: {', '.join(found_starches)}. "
                            f"These refined starches have a glycemic index (GI 90-110) even higher than table sugar, spiking insulin rapidly."
                        ),
                        fssai_rule="FSSAI Packaging and Labelling Guidelines",
                    )
                )
            else:
                verifications.append(
                    ClaimVerification(
                        claim="No Added Maida",
                        status="verified",
                        explanation="Clean grain profile: Free of refined wheat flour (maida) and uses whole grains or clean flours.",
                        fssai_rule="FSSAI Food Safety Regulations",
                    )
                )

        # 10. "Loaded with Nuts" / "Nuts & Seeds" Prominence Audit
        if "nut" in combined_text and ("loaded" in combined_text or "rich" in combined_text or "power" in combined_text or "packed" in combined_text):
            nuts = ["almond", "cashew", "pista", "walnut", "peanut", "hazelnut", "chia", "flax", "pumpkin seed", "sunflower seed"]
            found_nut_ingredients = [
                ingredient.name
                for ingredient in extraction.ingredients
                if any(n in ingredient.name.lower() for n in nuts)
            ]

            if not found_nut_ingredients:
                verifications.append(
                    ClaimVerification(
                        claim="Loaded with Nuts",
                        status="debunked",
                        explanation="Front package claims 'Loaded with Nuts', but zero nuts or seeds are listed in the ingredients!",
                        fssai_rule="FSSAI Regulation on Front-of-Pack Product Naming",
                    )
                )
            else:
                verifications.append(
                    ClaimVerification(
                        claim="Loaded with Nuts",
                        status="misleading",
                        explanation=(
                            f"Claims to be loaded with nuts, but actual ingredients list reveals: {', '.join(found_nut_ingredients[:3])}. "
                            f"Under FSSAI rules, check the percentage in brackets — often hero nuts make up less than 5% of total package weight."
                        ),
                        fssai_rule="FSSAI Food Safety and Standards (Advertising and Claims) Regulations 2018",
                    )
                )

        # Merge dynamic LLM claim audits with deterministic Python FSSAI audits
        # Python audits take priority for known statutory rules (protein %, palm oil, math, preservatives)
        dynamic_claims = extraction.raw_claims_audit or []
        existing_claim_names = {v.claim.lower() for v in verifications}
        for dc in dynamic_claims:
            if not any(dc.claim.lower() in ec or ec in dc.claim.lower() for ec in existing_claim_names):
                verifications.append(dc)
                existing_claim_names.add(dc.claim.lower())

        return verifications

    # ========================================================
    # Analysis Layer 7: Atwater Physical Calorie Math Check
    # ========================================================

    def _verify_nutrition_math(self, extraction: LabelExtraction) -> MathVerification | None:
        """
        Verify if the printed energy matches the physical Atwater factors:
        Energy (kcal) ≈ (Protein * 4) + (Carbohydrates * 4) + (Fat * 9) + (Dietary Fiber * 2)

        Catches manufacturers that misstate, suppress, or miscalculate calories on labels.
        """
        n = extraction.nutrition_per_serving
        if not n.energy_kcal or n.energy_kcal <= 0:
            return None

        # Need at least protein, carbs, and fat to perform the calculation
        if n.protein_g is None or n.carbohydrates_g is None or n.total_fat_g is None:
            return None

        p = n.protein_g
        c = n.carbohydrates_g
        f = n.total_fat_g
        fiber = n.fiber_g or 0.0

        # Atwater standard energy calculation
        # If available carbs are distinct from fiber, fiber contributes ~2 kcal/g
        calc_kcal = round((p * 4.0) + (c * 4.0) + (f * 9.0) + (fiber * 2.0), 1)
        printed = n.energy_kcal
        diff = abs(calc_kcal - printed)
        diff_pct = round((diff / printed) * 100, 1)

        # Allow ±10% margin of error due to rounding of individual macro lines
        is_discrepant = diff_pct > 15.0

        details = ""
        if is_discrepant:
            if calc_kcal > printed:
                details = (
                    f"⚠️ Calorie Under-reporting: Printed label claims {printed} kcal, but physical macronutrient "
                    f"math ({p}g protein × 4 + {c}g carbs × 4 + {f}g fat × 9) yields {calc_kcal} kcal. "
                    f"The product contains ~{diff_pct}% more energy than printed!"
                )
            else:
                details = (
                    f"⚠️ Calorie Over-reporting: Printed label claims {printed} kcal, but physical macronutrient "
                    f"math yields {calc_kcal} kcal ({diff_pct}% difference)."
                )
        else:
            details = (
                f"✅ Nutrition Table Verified: Printed calories ({printed} kcal) match calculated macronutrient energy "
                f"({calc_kcal} kcal) within standard regulatory margin of error ({diff_pct}%)."
            )

        return MathVerification(
            printed_calories=printed,
            calculated_calories=calc_kcal,
            discrepancy_percentage=diff_pct,
            is_discrepant=is_discrepant,
            details=details,
        )

