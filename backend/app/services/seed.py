"""
Seed the shared catalog with popular Indian packaged foods from Open Food Facts.

Why: a catalog that starts empty has nothing to search or compare against.
Seeding the most-scanned Indian products gives day-one coverage, with no
Gemini calls (each product goes through the same deterministic engine).

Quality filters (Open Food Facts is crowd-sourced, so we're picky):
- Indian barcodes only (GS1 India prefix 890), so imported variants of
  global brands with different recipes are skipped
- Nutrition facts AND ingredients marked complete by OFF contributors
- Completeness score >= 0.6, a product name, usable per-100g nutrition
- Physically impossible values are repaired or rejected by sanitize_extraction
- One entry per product: other pack sizes of the same item are skipped
- Waters and salt are skipped (nothing meaningful to judge)
Every seeded audit is labelled "Data: Open Food Facts" and can be reported.
"""

import asyncio
import logging
import re
from difflib import SequenceMatcher

import httpx
from sqlmodel import Session, select

from app.models.db_models import ProductScan
from app.services import open_food_facts as off
from app.services.analyzer import Analyzer, sanitize_extraction
from app.services.catalog import save_to_catalog
from app.services.naming import phonetic

logger = logging.getLogger(__name__)

SEARCH_FIELDS = off.FIELDS + ",completeness,unique_scans_n"
# Not useful to "check": nothing to judge on a water bottle or a salt packet
SKIP_CATEGORIES = ("en:waters", "en:spring-waters", "en:mineral-waters", "en:salts", "en:table-salts")


_GENERIC = {"biscuit", "biscuits", "cookie", "cookies", "chips", "namkeen", "noodles", "brand", "flavour",
            "flavor", "flv", "original", "origina", "orignal", "classic", "can", "drink", "fresh", "pure", "taste"}


def product_identity(brand: str | None, name: str | None) -> str:
    """
    A fuzzy-comparable identity: brand words and generic words removed, Hinglish-normalised.
    'Britannia Vita Marie Gold Biscuits' and 'Marie Gold' → 'vitamariegold' / 'mariegold'.
    """
    brand_words = {phonetic(w) for w in re.split(r"[\s\-]+", brand or "") if phonetic(w)}
    words = [phonetic(w) for w in re.split(r"[\s\-()/]+", name or "")]
    core = [w for w in words if w and w not in brand_words and w not in {phonetic(g) for g in _GENERIC}]
    identity = "".join(core)
    if len(identity) < 4:  # name was mostly brand/generic words: keep brand for distinctness
        identity = "".join(sorted(brand_words)) + identity
    return identity


def is_duplicate(identity: str, seen: set[str]) -> bool:
    for other in seen:
        if identity == other:
            return True
        short, long_ = sorted((identity, other), key=len)
        if len(short) >= 5 and short in long_:  # "mariegold" in "vitamariegold"
            return True
        if SequenceMatcher(None, identity, other).ratio() >= 0.85:  # "magiemasala" ~ "magimasala"
            return True
    return False


async def fetch_popular_indian(page: int, page_size: int = 100) -> list[dict]:
    params = {
        "countries_tags_en": "india",
        "states_tags": "en:nutrition-facts-completed,en:ingredients-completed",
        "sort_by": "unique_scans_n",
        "page_size": page_size,
        "page": page,
        "fields": SEARCH_FIELDS,
    }
    async with httpx.AsyncClient(timeout=30.0, headers={"User-Agent": off.settings.off_user_agent}) as client:
        for attempt in range(4):
            response = await client.get(f"{off.settings.off_base_url}/api/v2/search", params=params)
            if response.status_code not in (429, 503) or attempt == 3:
                break
            wait = 15 * (attempt + 1)  # OFF rate-limits search; back off politely
            logger.warning("Open Food Facts busy (%s), retrying in %ss", response.status_code, wait)
            await asyncio.sleep(wait)
    response.raise_for_status()
    return response.json().get("products", [])


async def seed_from_open_food_facts(session: Session, target: int = 100, max_pages: int = 5) -> dict:
    analyzer = Analyzer()
    rows = session.exec(select(ProductScan.barcode, ProductScan.brand, ProductScan.product_name)).all()
    existing = {r[0] for r in rows if r[0]}
    identities = {product_identity(r[1], r[2]) for r in rows}
    added, skipped = [], {"not_indian": 0, "low_quality": 0, "already_in_catalog": 0, "no_nutrition": 0,
                          "duplicate_pack_size": 0, "not_checkable": 0}

    for page in range(1, max_pages + 1):
        if len(added) >= target:
            break
        if page > 1:
            await asyncio.sleep(6)  # OFF allows ~10 search requests per minute
        products = await fetch_popular_indian(page)
        if not products:
            break
        for product in products:
            if len(added) >= target:
                break
            code = str(product.get("code") or "")
            if not (code.startswith("890") and off.is_valid_barcode(code)):
                skipped["not_indian"] += 1
                continue
            if code in existing:
                skipped["already_in_catalog"] += 1
                continue
            if (product.get("completeness") or 0) < 0.6 or not product.get("product_name"):
                skipped["low_quality"] += 1
                continue
            if any(tag in (product.get("categories_tags") or []) for tag in SKIP_CATEGORIES):
                skipped["not_checkable"] += 1
                continue
            extraction = off.to_extraction(product, code)
            if extraction is None:
                skipped["no_nutrition"] += 1
                continue
            name_core = phonetic(extraction.product_name or "")
            if not name_core or name_core in {phonetic(extraction.brand or "")}:  # name is just the brand, e.g. "Kissan"
                skipped["low_quality"] += 1
                continue
            identity = product_identity(extraction.brand, extraction.product_name)
            if is_duplicate(identity, identities):  # same product: other pack size, spelling or barcode
                skipped["duplicate_pack_size"] += 1
                continue
            extraction = sanitize_extraction(extraction)
            analysis = analyzer.analyze(extraction)
            record, _ = save_to_catalog(session, analyzer, extraction, analysis, source="open_food_facts")
            existing.add(code)
            identities.add(identity)
            added.append(f"{record.brand or ''} {record.product_name}".strip())

    logger.info("Seeded %d products from Open Food Facts (skipped: %s)", len(added), skipped)
    return {"added": len(added), "skipped": skipped, "products": added}
