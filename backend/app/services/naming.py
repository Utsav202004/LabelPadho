"""
Product name standardisation.

Labels print names in every style: "BOURBON", "mini cake", "Haldiram's".
The vision model copies them as-is, so the shared catalog ends up looking
inconsistent and search results look messy. We normalise display casing:

- ALL-CAPS words longer than 3 letters → Title case   ("BOURBON" → "Bourbon")
- Short ALL-CAPS words are kept (likely acronyms)     ("KTC", "ORS", "MTR")
- all-lowercase words → Capitalised                    ("maggi" → "Maggi")
- Mixed-case words are trusted as printed               ("McVitie's", "iD", "NutriChoice")
- Small joining words stay lowercase mid-name           ("Bread and Butter")
"""

import re

_KEEP_LOWER = {"and", "or", "of", "with", "in", "the", "a", "an", "for", "n", "&"}
_UNITS = re.compile(r"^\d+(\.\d+)?(g|gm|kg|ml|l)$", re.IGNORECASE)


def _fix_word(word: str, is_first: bool) -> str:
    if not any(c.isalpha() for c in word):
        return word
    if _UNITS.match(word):
        return word.lower()  # "150G" → "150g"
    # Handle hyphenated / apostrophe parts separately: "2-MINUTE" → "2-Minute"
    if "-" in word:
        return "-".join(_fix_word(p, is_first and i == 0) for i, p in enumerate(word.split("-")))

    letters = "".join(c for c in word if c.isalpha())
    lower = word.lower()
    if not is_first and lower in _KEEP_LOWER:
        return lower
    if letters.isupper():
        if len(letters) <= 3:
            return word  # acronym-like: KTC, ORS
        return _capitalise(word)
    if letters.islower():
        return _capitalise(word)
    return word  # mixed case: trust the brand's styling


def _capitalise(word: str) -> str:
    # "HALDIRAM'S" → "Haldiram's" (str.capitalize would also be fine, but keep
    # leading punctuation/digits intact: "(MASALA" → "(Masala")
    for i, c in enumerate(word):
        if c.isalpha():
            return word[:i] + c.upper() + word[i + 1:].lower()
    return word


def standardize_name(value: str | None) -> str | None:
    """Return a consistently cased, whitespace-collapsed name (None/blank → None)."""
    if value is None:
        return None
    collapsed = " ".join(value.split()).strip(" ,.-")
    if not collapsed:
        return None
    words = collapsed.split(" ")
    return " ".join(_fix_word(w, i == 0) for i, w in enumerate(words))


def display_name(brand: str | None, product_name: str | None, variant: str | None) -> str:
    """'Britannia Bourbon (Chocolate Cream)' — avoids repeating the brand if the name already has it."""
    name = product_name or "Food Product"
    if brand and not name.lower().startswith(brand.lower()):
        name = f"{brand} {name}"
    if variant and variant.lower() not in name.lower():
        name = f"{name} ({variant})"
    return name
