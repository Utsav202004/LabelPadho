"""
Product search API — find previously scanned products without re-uploading photos.

Every successful /api/analyze call persists a ProductScan row (with the full
analysis JSON). This endpoint lets the frontend search those rows by product
name or brand so users can open an existing audit instantly instead of
re-running Gemini extraction.

- GET /api/products/search?q=maggi        → unique products matching every search word
- GET /api/products/suggestions           → latest unique products (search dropdown before typing)
- GET /api/products/count                 → number of distinct products (live counter on the home page)
- GET /api/products/{id}/alternatives     → better-scoring products on the same shelf + rank
- GET /api/products/barcode/{code}        → catalog hit, else Open Food Facts, else "scan the label"
"""

import json
import logging
import re
from difflib import SequenceMatcher
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.db_models import ProductScan, ProductScanRead
import httpx

from app.core.admin import require_admin
from app.core.rate_limit import SlidingWindowLimiter
from app.models.schemas import SUB_CATEGORIES
from app.services import open_food_facts as off
from app.services.analyzer import Analyzer, sanitize_extraction
from app.services.catalog import save_to_catalog
from app.services.naming import phonetic
from app.services.open_food_facts import is_valid_barcode
from app.services.seed import seed_from_open_food_facts

router = APIRouter()
logger = logging.getLogger(__name__)
_analyzer = Analyzer()
barcode_limiter = SlidingWindowLimiter("barcode lookups", 60)


def _normalize(text: str | None) -> str:
    return " ".join((text or "").lower().split())


def apply_search_filter(query, q: str):
    """Require every word of `q` to appear in the product name, brand or variant (case-insensitive)."""
    for word in _normalize(q).split():
        # Escape LIKE wildcards so "%" or "_" in user input match literally
        escaped = word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        query = query.where(
            or_(
                func.lower(ProductScan.product_name).like(pattern, escape="\\"),
                func.lower(func.coalesce(ProductScan.brand, "")).like(pattern, escape="\\"),
                func.lower(func.coalesce(ProductScan.variant, "")).like(pattern, escape="\\"),
            )
        )
    return query


def search_scans(session: Session, q: str, limit: int) -> list[ProductScan]:
    """
    Return the latest scan of each unique product matching every word in `q`.

    Each word must appear (case-insensitively) in either the product name or
    the brand, so "amul whey" matches brand="Amul", name="Whey Protein".
    Repeat scans of the same product (same name + brand + variant) are collapsed to the
    most recent one.
    """
    if not _normalize(q):
        return []

    query = apply_search_filter(select(ProductScan), q).order_by(ProductScan.created_at.desc())
    exact = _unique_products(session.exec(query.limit(limit * 5)).all(), limit)
    if len(exact) >= limit:
        return exact
    # Not enough exact hits: fall back to typo/transliteration-tolerant matching
    seen = {_product_key(s) for s in exact}
    fuzzy = [s for s in fuzzy_search(session, q, limit) if _product_key(s) not in seen]
    return (exact + fuzzy)[:limit]


# ---------------------------------------------------------------------------
# Fuzzy search: "bhujiya" → Bhujia, "magi" → Maggi, "lays" → Lay's, "burbon" → Bourbon
# ---------------------------------------------------------------------------
# Indian product names are typed in many romanised spellings, so we normalise
# common Hinglish variations, then compare tokens with an edit-distance ratio.
# This runs in Python over the latest few thousand catalog rows, which is
# plenty for this catalog; at scale the same idea moves into Postgres
# (pg_trgm trigram indexes) or a search engine.

FUZZY_CANDIDATES = 3000


def _token_score(query_token: str, name_tokens: list[str]) -> float:
    best = 0.0
    for nt in name_tokens:
        if len(query_token) >= 3 and nt.startswith(query_token):
            return 1.0  # prefix: "bisc" → "biscuit"
        best = max(best, SequenceMatcher(None, query_token, nt).ratio())
    return best


def fuzzy_score(query: str, scan: ProductScan) -> float:
    q_tokens = [phonetic(t) for t in query.split() if phonetic(t)]
    name = f"{scan.brand or ''} {scan.product_name or ''} {scan.variant or ''}"
    n_tokens = [phonetic(t) for t in re.split(r"[\s\-/()]+", name) if phonetic(t)]
    if not q_tokens or not n_tokens:
        return 0.0
    scores = [_token_score(t, n_tokens) for t in q_tokens]
    # every word must roughly match something; average decides the ranking
    return 0.0 if min(scores) < 0.75 else sum(scores) / len(scores)


def fuzzy_search(session: Session, q: str, limit: int) -> list[ProductScan]:
    candidates = session.exec(
        select(ProductScan).order_by(ProductScan.created_at.desc()).limit(FUZZY_CANDIDATES)
    ).all()
    scored = [(fuzzy_score(q, s), s) for s in _unique_products(candidates, FUZZY_CANDIDATES)]
    scored = [(score, s) for score, s in scored if score >= 0.8]
    scored.sort(key=lambda pair: pair[0], reverse=True)  # stable: ties keep newest first
    return [s for _, s in scored[:limit]]


def _product_key(scan: ProductScan) -> tuple[str, str, str]:
    return (_normalize(scan.product_name), _normalize(scan.brand), _normalize(scan.variant))


def _unique_products(scans, limit: int) -> list[ProductScan]:
    """Keep the first (latest) scan per product; repeat scans of the same item collapse."""
    results: list[ProductScan] = []
    seen: set[tuple[str, str, str]] = set()
    for scan in scans:
        key = _product_key(scan)
        if key in seen:
            continue
        seen.add(key)
        results.append(scan)
        if len(results) >= limit:
            break
    return results


@router.get("/products/search", response_model=List[ProductScanRead])
async def search_products(
    q: str = Query(..., min_length=1, max_length=100, description="Product name or brand"),
    limit: int = Query(8, ge=1, le=50),
    session: Session = Depends(get_session),
):
    """Search previously scanned products by name or brand (latest scan per product)."""
    return search_scans(session, q, limit)


@router.get("/products/count")
async def product_count(session: Session = Depends(get_session)):
    """How many distinct products the shared catalog holds (repeat scans of one item count once)."""
    keys = {_product_key(scan) for scan in session.exec(select(ProductScan)).all()}
    return {"count": len(keys)}


@router.get("/products/suggestions", response_model=List[ProductScanRead])
async def product_suggestions(
    limit: int = Query(8, ge=1, le=30),
    session: Session = Depends(get_session),
):
    """Latest unique products in the shared catalog — shown in the search dropdown before typing."""
    query = select(ProductScan).order_by(ProductScan.created_at.desc()).limit(limit * 5)
    return _unique_products(session.exec(query).all(), limit)


class AlternativesResponse(BaseModel):
    scope: str  # "sub_category" | "category"
    scope_label: str
    rank: Optional[int] = None  # this product's position by health score within the scope
    total: int  # unique scored products in the scope
    better: List[ProductScanRead]


@router.get("/products/{scan_id}/alternatives", response_model=AlternativesResponse)
async def product_alternatives(
    scan_id: int,
    limit: int = Query(5, ge=1, le=20),
    session: Session = Depends(get_session),
):
    """
    Shelf leaderboard for a product: healthier options on the same shelf.

    Compares within the narrow sub-category first (biscuits vs biscuits) and
    falls back to the broad category when the sub-category has no other items.
    """
    scan = session.get(ProductScan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan record not found")

    category = scan.product_category or "general_packaged"
    scopes: list[tuple[str, str, object]] = []
    if scan.sub_category:
        label = SUB_CATEGORIES.get(category, {}).get(scan.sub_category, scan.sub_category)
        scopes.append(("sub_category", label, ProductScan.sub_category == scan.sub_category))
    scopes.append(("category", category.replace("_", " ").title(), ProductScan.product_category == category))

    me = _product_key(scan)
    chosen = None
    for scope, label, condition in scopes:
        rows = session.exec(
            select(ProductScan)
            .where(condition, ProductScan.health_score.is_not(None))
            .order_by(ProductScan.health_score.desc(), ProductScan.created_at.desc())
        ).all()
        # Latest scan per product, then rank by score
        latest: dict[tuple[str, str, str], ProductScan] = {}
        for row in sorted(rows, key=lambda r: r.created_at, reverse=True):
            latest.setdefault(_product_key(row), row)
        ranked = sorted(latest.values(), key=lambda r: r.health_score or 0, reverse=True)
        chosen = (scope, label, ranked)
        if any(_product_key(r) != me for r in ranked):
            break  # this scope has something to compare against

    scope, label, ranked = chosen
    my_score = scan.health_score or 0
    rank = next((i + 1 for i, r in enumerate(ranked) if _product_key(r) == me), None)
    better = [r for r in ranked if _product_key(r) != me and (r.health_score or 0) > my_score][:limit]
    return AlternativesResponse(scope=scope, scope_label=label, rank=rank, total=len(ranked), better=better)


class BarcodeResponse(BaseModel):
    found: bool
    source: Optional[str] = None  # "catalog" | "open_food_facts"
    scan_id: Optional[int] = None
    message: str = ""


@router.get("/products/barcode/{code}", response_model=BarcodeResponse)
async def lookup_barcode(
    code: str,
    session: Session = Depends(get_session),
    _rate_limited: None = Depends(barcode_limiter),
):
    """
    Instant lookup by barcode.

    1. Already in our catalog → return it (no AI, no network).
    2. Known to Open Food Facts → build an audit from its data with the same
       deterministic engine, save it to the catalog, return it.
    3. Unknown → ask the shopper to photograph the label.
    """
    code = code.strip()
    if not is_valid_barcode(code):
        raise HTTPException(status_code=422, detail="A barcode should be 8 to 14 digits.")

    existing = session.exec(
        select(ProductScan).where(ProductScan.barcode == code).order_by(ProductScan.created_at.desc())
    ).first()
    if existing:
        return BarcodeResponse(found=True, source="catalog", scan_id=existing.id)

    try:
        product = await off.fetch_product(code)
    except Exception as e:  # network/OFF outage shouldn't look like "not found"
        logger.warning("Open Food Facts lookup failed for %s: %s", code, e)
        raise HTTPException(status_code=502, detail="Barcode database is unreachable right now. Please scan the label instead.")

    extraction = off.to_extraction(product, code) if product else None
    if extraction is None:
        return BarcodeResponse(
            found=False,
            message="This product isn't in any database yet. Photograph its label below and you'll be the first to add it!",
        )

    extraction = sanitize_extraction(extraction)
    analysis = _analyzer.analyze(extraction)
    record, _ = save_to_catalog(session, _analyzer, extraction, analysis, source="open_food_facts")
    return BarcodeResponse(found=True, source="open_food_facts", scan_id=record.id)



@router.post("/admin/seed-open-food-facts")
async def seed_catalog(
    target: int = Query(100, ge=1, le=300),
    start_page: int = Query(1, ge=1, le=100),
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    """
    Admin: add popular Indian products from Open Food Facts (skips ones already in the catalog).
    If Open Food Facts is busy the run stops early and says which start_page to continue from.
    """
    try:
        return await seed_from_open_food_facts(session, target=target, start_page=start_page)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Open Food Facts unavailable: {e}")


@router.post("/admin/refresh-missing-ingredients")
async def refresh_missing_ingredients(
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    """
    Admin: re-fetch Open Food Facts products saved without an ingredient list.
    OFF contributors keep adding data, so a product that had no ingredients
    when it was seeded may have them now. Rows are updated in place (same id/link).
    """
    from app.core.db import apply_rescore
    from app.models.schemas import LabelExtraction

    updated, still_missing, failed = [], [], []
    rows = session.exec(select(ProductScan).where(ProductScan.source == "open_food_facts")).all()
    for scan in rows:
        try:
            extraction = LabelExtraction.model_validate(json.loads(scan.full_analysis_json or "{}").get("extraction") or {})
        except Exception:  # noqa: BLE001 - skip unreadable rows
            continue
        if extraction.ingredients or not scan.barcode:
            continue
        label = f"{scan.id} {scan.product_name}"
        try:
            product = await off.fetch_product(scan.barcode)
        except Exception as e:  # noqa: BLE001 - one bad lookup shouldn't stop the rest
            logger.warning("OFF refresh failed for %s: %s", scan.barcode, e)
            failed.append(label)
            continue
        fresh = off.to_extraction(product, scan.barcode) if product else None
        if fresh is None or not fresh.ingredients:
            still_missing.append(label)
            continue
        # Keep the catalog's cleaned name/brand; take OFF's ingredients and nutrition
        fresh = sanitize_extraction(fresh.model_copy(update={"product_name": scan.product_name, "brand": scan.brand}))
        apply_rescore(scan, fresh, _analyzer)
        session.add(scan)
        updated.append(label)
    session.commit()
    return {"updated": updated, "still_missing": still_missing, "failed": failed}
