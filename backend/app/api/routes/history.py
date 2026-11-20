"""
History and scan persistence API endpoints.

Provides:
- GET /api/history: List recent scans with filtering (?q= searches name/brand)
- GET /api/history/{id}: Fetch full analysis details of a specific past scan
- PATCH /api/history/{id}: Fix a misread brand/name/variant (only with the scanner's edit token)
- DELETE /api/history/{id}: Remove a scan from history
"""

import json
import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.db_models import ProductScan, ProductScanRead
from app.models.schemas import ProductAnalysis
from app.api.routes.products import apply_search_filter
from app.services.naming import standardize_name

router = APIRouter()


@router.get("/history", response_model=List[ProductScanRead])
async def list_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: Optional[str] = Query(None, description="Optional user filter"),
    q: Optional[str] = Query(None, max_length=100, description="Filter by product name or brand"),
    session: Session = Depends(get_session),
):
    """List past product scans ordered by latest first."""
    query = select(ProductScan).order_by(ProductScan.created_at.desc())
    if user_id:
        query = query.where(ProductScan.user_id == user_id)
    if q:
        query = apply_search_filter(query, q)

    query = query.offset(offset).limit(limit)
    scans = session.exec(query).all()
    return scans


@router.get("/history/{scan_id}", response_model=ProductAnalysis)
async def get_scan_details(
    scan_id: int,
    session: Session = Depends(get_session),
):
    """Retrieve full analysis snapshot for a past scan by ID."""
    scan = session.get(ProductScan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan record not found")

    try:
        raw_dict = json.loads(scan.full_analysis_json)
        analysis = ProductAnalysis.model_validate(raw_dict)
        return analysis.model_copy(update={"scan_id": scan.id})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to decode saved analysis: {e}")


class RenameRequest(BaseModel):
    edit_token: str = Field(min_length=10, max_length=200)
    product_name: str = Field(min_length=1, max_length=120)
    brand: Optional[str] = Field(None, max_length=80)
    variant: Optional[str] = Field(None, max_length=80)


@router.patch("/history/{scan_id}", response_model=ProductScanRead)
async def rename_scan(
    scan_id: int,
    body: RenameRequest,
    session: Session = Depends(get_session),
):
    """
    Correct a misread product name.

    Only the person who scanned the product holds the edit token (returned by
    /api/analyze), so a shared catalog entry can't be renamed by strangers.
    """
    scan = session.get(ProductScan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan record not found")
    if not scan.edit_token or not secrets.compare_digest(scan.edit_token, body.edit_token):
        raise HTTPException(status_code=403, detail="Only the person who scanned this product can rename it")

    name = standardize_name(body.product_name)
    if not name:
        raise HTTPException(status_code=422, detail="Product name cannot be empty")
    scan.product_name = name
    scan.brand = standardize_name(body.brand)
    scan.variant = standardize_name(body.variant)

    # Keep the stored full audit in sync so reopening it shows the new name
    try:
        data = json.loads(scan.full_analysis_json or "{}")
        if isinstance(data.get("extraction"), dict):
            data["extraction"].update(
                product_name=scan.product_name, brand=scan.brand, variant=scan.variant
            )
            scan.full_analysis_json = json.dumps(data)
    except json.JSONDecodeError:
        pass

    session.add(scan)
    session.commit()
    session.refresh(scan)
    return scan


@router.delete("/history/{scan_id}")
async def delete_scan(
    scan_id: int,
    session: Session = Depends(get_session),
):
    """Delete a scan record from history."""
    scan = session.get(ProductScan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan record not found")

    session.delete(scan)
    session.commit()
    return {"success": True, "message": f"Scan {scan_id} deleted"}
