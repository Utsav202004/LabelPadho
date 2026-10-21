"""
Educational Knowledge Base for Nutrition Concepts.

This module acts as the persistent learning catalog for LabelPadho.
When a user encounters a nutritional or additive concept for the first time,
the system retrieves the educational breakdown and saves the interaction to
the user's profile history.
"""

from typing import Dict, Any

EDUCATIONAL_TOPICS: Dict[str, Dict[str, Any]] = {
    "sodium_effects": {
        "title": "What Does Excess Sodium Do?",
        "summary": "High sodium increases fluid retention and blood pressure, straining your cardiovascular system and kidneys.",
        "threshold_condition": "Sodium > 300mg per serving or > 15% Daily Value",
        "actionable_tip": "Look for snacks with < 140mg sodium per serving (defined as 'low sodium' by food standards)."
    },
    "trans_fat_danger": {
        "title": "The Hidden Trans Fat Loophole",
        "summary": "Partially hydrogenated oils create industrial trans fats. Regulations allow rounding down to '0g' if under 0.5g/serving.",
        "threshold_condition": "Presence of 'hydrogenated' or 'partially hydrogenated' in ingredients",
        "actionable_tip": "If ingredients list 'partially hydrogenated vegetable oil', avoid it regardless of the 0g claim on the front."
    },
    "added_sugar_reality": {
        "title": "Free Sugars & Metabolic Overload",
        "summary": "Sugars stripped of natural plant fiber enter the bloodstream rapidly, spiking insulin and promoting visceral fat storage.",
        "threshold_condition": "Sugar > 5g per serving in non-dessert food",
        "actionable_tip": "Check for alternative names like maltodextrin, invert syrup, dextrose, and high-fructose corn syrup."
    },
    "serving_size_trick": {
        "title": "The Single-Serving Illusion",
        "summary": "Companies report macros for fractions of packages (e.g. 20g chips) to conceal high calorie and sodium counts.",
        "threshold_condition": "Package contains > 1.5 standard servings",
        "actionable_tip": "Always multiply the numbers by the total servings in the packet before deciding how much to eat."
    },
    "refined_palmolein": {
        "title": "Palmolein in Indian Packaged Snacks",
        "summary": "Palm oil is ~50% saturated fat and commonly used for long shelf-life and cheap frying costs.",
        "threshold_condition": "Presence of 'palmolein' or generic 'edible vegetable oil'",
        "actionable_tip": "Prioritize snacks roasted or cooked in mustard, groundnut, or cold-pressed oils."
    }
}
