"""
Product search API — find previously scanned products without re-uploading photos.

Every successful /api/analyze call persists a ProductScan row (with the full
analysis JSON). This endpoint lets the frontend search those rows by product
name or brand so users can open an existing audit instantly instead of
re-running Gemini extraction.

- GET /api/products/search?q=maggi        → unique products matching every search word
- GET /api/products/suggestions           → latest unique products (search dropdown before typing)
- GET /api/products/{id}/alternatives     → better-scoring products on the same shelf + rank
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.db_models import ProductScan, ProductScanRead
from app.models.schemas import SUB_CATEGORIES

router = APIRouter()


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
    return _unique_products(session.exec(query.limit(limit * 5)).all(), limit)


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
