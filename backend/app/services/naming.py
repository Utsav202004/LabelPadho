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
    def squash(text: str) -> str:  # "Lay's" == "Lays"
        return re.sub(r"[^a-z0-9]", "", text.lower())

    name = product_name or "Food Product"
    if brand and not squash(name).startswith(squash(brand)):
        name = f"{brand} {name}"
    if variant and squash(variant) not in squash(name):
        name = f"{name} ({variant})"
    return name


# Romanised Hindi/English spellings vary a lot ("bhujiya"/"bhujia", "maggi"/"magi").
_PHONETIC = [("ph", "f"), ("ee", "i"), ("oo", "u"), ("y", "i"), ("w", "v"), ("z", "j"), ("q", "k")]


def phonetic(token: str) -> str:
    """Normalise a word for fuzzy matching: lowercase, letters/digits only, common Hinglish swaps, no doubled letters."""
    t = re.sub(r"[^a-z0-9]", "", token.lower())
    for a, b in _PHONETIC:
        t = t.replace(a, b)
    return re.sub(r"(.)\1+", r"\1", t)


_LEGAL_WORDS = {"pvt", "ltd", "limited", "private", "company", "co", "holdings", "industries", "india",
                "the", "beverages", "foods", "food", "inc", "llp", "corp", "corporation", "&", "and"}


def clean_brand(brand: str | None) -> str | None:
    """'Pepsico India Holdings PVT LTD' → 'Pepsico', 'The Coca-Cola Company' → 'Coca-Cola'."""
    if not brand:
        return None
    words = [w for w in brand.replace(".", " ").split() if w.lower().strip(",") not in _LEGAL_WORDS]
    return " ".join(words).strip(" ,-") or brand.strip()


# Emojis (and the invisible variation selector that follows some of them)
_EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B50\u2B55\u2705\u274C\uFE0F]")
# Old generated phrasings, kept in reports saved before the wording changed
_OLD_PHRASES = [
    ("Nutrition Table Verified:", "Nutrition table checks out:"),
    ("Calorie Under-reporting:", "Calorie under-reporting:"),
    ("Calorie Over-reporting:", "Calorie over-reporting:"),
    ("the #1 primary ingredient by weight", "the first (largest) ingredient by weight"),
    ("(the #1 ingredient is present in the largest quantity)", "(the first ingredient is present in the largest quantity)"),
]


def clean_display_text(text: str) -> str:
    """Remove emojis and outdated phrasings from generated report text."""
    for old, new in _OLD_PHRASES:
        text = text.replace(old, new)
    cleaned = _EMOJI.sub("", text)
    if cleaned != text:
        cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()
    return cleaned


def clean_report_data(value):
    """Apply clean_display_text to every string inside a saved report (dicts/lists, recursively)."""
    if isinstance(value, str):
        return clean_display_text(value)
    if isinstance(value, list):
        return [clean_report_data(v) for v in value]
    if isinstance(value, dict):
        return {k: clean_report_data(v) for k, v in value.items()}
    return value
