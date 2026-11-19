"""
Product search API — find previously scanned products without re-uploading photos.

Every successful /api/analyze call persists a ProductScan row (with the full
analysis JSON). This endpoint lets the frontend search those rows by product
name or brand so users can open an existing audit instantly instead of
re-running Gemini extraction.

- GET /api/products/search?q=maggi  → unique products matching every search word
"""

from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.db_models import ProductScan, ProductScanRead

router = APIRouter()


def _normalize(text: str | None) -> str:
    return " ".join((text or "").lower().split())


def apply_search_filter(query, q: str):
    """Require every word of `q` to appear in the product name or brand (case-insensitive)."""
    for word in _normalize(q).split():
        # Escape LIKE wildcards so "%" or "_" in user input match literally
        escaped = word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        query = query.where(
            or_(
                func.lower(ProductScan.product_name).like(pattern, escape="\\"),
                func.lower(func.coalesce(ProductScan.brand, "")).like(pattern, escape="\\"),
            )
        )
    return query


def search_scans(session: Session, q: str, limit: int) -> list[ProductScan]:
    """
    Return the latest scan of each unique product matching every word in `q`.

    Each word must appear (case-insensitively) in either the product name or
    the brand, so "amul whey" matches brand="Amul", name="Whey Protein".
    Repeat scans of the same product (same name + brand) are collapsed to the
    most recent one.
    """
    if not _normalize(q):
        return []

    query = apply_search_filter(select(ProductScan), q).order_by(ProductScan.created_at.desc())

    results: list[ProductScan] = []
    seen: set[tuple[str, str]] = set()
    # Over-fetch a bit so de-duplication still leaves `limit` unique products
    for scan in session.exec(query.limit(limit * 5)).all():
        key = (_normalize(scan.product_name), _normalize(scan.brand))
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
