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


# Manufacturer names that sometimes end up in the product-name field
COMPANY_NAMES = {phonetic(w) for w in ["pepsico", "nestle", "itc", "hul", "hindustan unilever", "britannia industries",
                                        "parle products", "food", "foods", "snacks", "coca cola company"]}

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
            try:
                response = await client.get(f"{off.settings.off_base_url}/api/v2/search", params=params)
                if response.status_code not in (429, 502, 503, 504):
                    break
                problem = f"HTTP {response.status_code}"
            except httpx.TransportError as e:  # timeouts, dropped connections
                problem = type(e).__name__
            if attempt == 3:
                raise httpx.HTTPError(f"Open Food Facts unavailable after retries ({problem})")
            wait = 15 * (attempt + 1)  # OFF rate-limits search; back off politely
            logger.warning("Open Food Facts busy (%s), retrying in %ss", problem, wait)
            await asyncio.sleep(wait)
    response.raise_for_status()
    return response.json().get("products", [])


async def seed_from_open_food_facts(
    session: Session, target: int = 100, max_pages: int | None = None, start_page: int = 1
) -> dict:
    # Roughly 2 in 5 listings pass the quality filters, and already-seeded ones are
    # skipped, so look through enough pages (100 listings each) to reach the target.
    if max_pages is None:
        max_pages = min(20, 3 + (target * 5) // 100)
    analyzer = Analyzer()
    rows = session.exec(select(ProductScan.barcode, ProductScan.brand, ProductScan.product_name)).all()
    existing = {r[0] for r in rows if r[0]}
    identities = {product_identity(r[1], r[2]) for r in rows}
    stopped_early: str | None = None
    added, skipped = [], {"not_indian": 0, "low_quality": 0, "already_in_catalog": 0, "no_nutrition": 0,
                          "duplicate_pack_size": 0, "not_checkable": 0}

    last_page = start_page - 1
    for page in range(start_page, start_page + max_pages):
        if len(added) >= target:
            break
        if page > start_page:
            await asyncio.sleep(6)  # OFF allows ~10 search requests per minute
        try:
            products = await fetch_popular_indian(page)
        except httpx.HTTPError as e:
            # Keep what we've added so far; running the seed again continues from here
            logger.warning("Stopping seed early at page %d: %s", page, e)
            stopped_early = str(e)
            break
        last_page = page
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
            if (
                not name_core
                or name_core == phonetic(extraction.brand or "")  # name is just the brand, e.g. "Kissan"
                or name_core in COMPANY_NAMES  # name is the manufacturer, e.g. "Pepsico"
            ):
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
    result = {"added": len(added), "skipped": skipped, "products": added}
    if stopped_early:
        result["stopped_early"] = (
            f"{stopped_early}. Run the seed again later with start_page={last_page + 1} to continue."
        )
    result["last_page"] = last_page
    return result
