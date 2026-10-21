"""
History and scan persistence API endpoints.

Provides:
- GET /api/history: List recent scans with filtering
- GET /api/history/{id}: Fetch full analysis details of a specific past scan
- DELETE /api/history/{id}: Remove a scan from history
"""

import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.core.db import get_session
from app.models.db_models import ProductScan, ProductScanRead
from app.models.schemas import ProductAnalysis

router = APIRouter()


@router.get("/history", response_model=List[ProductScanRead])
async def list_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: Optional[str] = Query(None, description="Optional user filter"),
    session: Session = Depends(get_session),
):
    """List past product scans ordered by latest first."""
    query = select(ProductScan).order_by(ProductScan.created_at.desc())
    if user_id:
        query = query.where(ProductScan.user_id == user_id)

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
        return ProductAnalysis.model_validate(raw_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to decode saved analysis: {e}")


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
