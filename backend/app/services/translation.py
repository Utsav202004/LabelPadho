"""
Translate the human-readable parts of an audit (verdicts, explanations) while
keeping every number, score and structure untouched.

Only prose goes to the model; the deterministic analysis is never re-run or
re-interpreted, so a translated audit can't change a score or a flag.
"""

from app.models.schemas import ProductAnalysis

LANGUAGES = {"hi": "Hindi (Devanagari script)"}


def collect_texts(a: ProductAnalysis) -> dict[str, str]:
    texts: dict[str, str] = {}

    def put(key: str, value: str | None):
        if value and value.strip():
            texts[key] = value

    put("one_line_summary", a.one_line_summary)
    put("detailed_summary", a.detailed_summary)
    put("category_display_name", a.category_display_name)
    put("sub_category_display_name", a.sub_category_display_name)
    if a.serving_reality:
        put("serving", a.serving_reality.realistic_consumption)
    if a.math_verification:
        put("math", a.math_verification.details)
    if a.price_analysis:
        put("price", a.price_analysis.value_verdict)
    if a.ingredient_breakdown:
        put("fssai", a.ingredient_breakdown.fssai_disclosure)
        put("hero", a.ingredient_breakdown.hero_insight)
    for i, f in enumerate(a.score_factors):
        put(f"factor.{i}", f.label)
    for i, flag in enumerate(a.ingredient_flags):
        put(f"flag.{i}.title", flag.title)
        put(f"flag.{i}.explanation", flag.explanation)
    for i, claim in enumerate(a.claim_verifications):
        put(f"claim.{i}.explanation", claim.explanation)
    for i, note in enumerate(a.educational_notes):
        put(f"note.{i}.title", note.title)
        put(f"note.{i}.explanation", note.explanation)
    for i, alt in enumerate(a.natural_alternatives):
        put(f"alt.{i}.note", alt.note)
    return texts


def apply_texts(a: ProductAnalysis, t: dict[str, str], language: str) -> ProductAnalysis:
    """Return a copy of `a` with translated prose (missing keys keep the original)."""
    c = a.model_copy(deep=True)
    c.one_line_summary = t.get("one_line_summary", c.one_line_summary)
    c.detailed_summary = t.get("detailed_summary", c.detailed_summary)
    c.category_display_name = t.get("category_display_name", c.category_display_name)
    c.sub_category_display_name = t.get("sub_category_display_name", c.sub_category_display_name)
    if c.serving_reality:
        c.serving_reality.realistic_consumption = t.get("serving", c.serving_reality.realistic_consumption)
    if c.math_verification:
        c.math_verification.details = t.get("math", c.math_verification.details)
    if c.price_analysis:
        c.price_analysis.value_verdict = t.get("price", c.price_analysis.value_verdict)
    if c.ingredient_breakdown:
        c.ingredient_breakdown.fssai_disclosure = t.get("fssai", c.ingredient_breakdown.fssai_disclosure)
        c.ingredient_breakdown.hero_insight = t.get("hero", c.ingredient_breakdown.hero_insight)
    for i, f in enumerate(c.score_factors):
        f.label = t.get(f"factor.{i}", f.label)
    for i, flag in enumerate(c.ingredient_flags):
        flag.title = t.get(f"flag.{i}.title", flag.title)
        flag.explanation = t.get(f"flag.{i}.explanation", flag.explanation)
    for i, claim in enumerate(c.claim_verifications):
        claim.explanation = t.get(f"claim.{i}.explanation", claim.explanation)
    for i, note in enumerate(c.educational_notes):
        note.title = t.get(f"note.{i}.title", note.title)
        note.explanation = t.get(f"note.{i}.explanation", note.explanation)
    for i, alt in enumerate(c.natural_alternatives):
        alt.note = t.get(f"alt.{i}.note", alt.note)
    c.language = language
    return c
