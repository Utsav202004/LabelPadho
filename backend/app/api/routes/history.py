"""
History and scan persistence API endpoints.

Provides:
- GET /api/history: List recent scans with filtering (?q= searches name/brand)
- GET /api/history/{id}: Fetch full analysis details of a specific past scan
- PATCH /api/history/{id}: Fix a misread brand/name/variant (only with the scanner's edit token)
- DELETE /api/history/{id}: Remove a scan from history
- POST /api/history/{id}/report: Flag an audit as wrong (review queue)
- GET /api/reports: Review queue (needs REPORTS_ADMIN_KEY)
"""

import json
import secrets
from datetime import datetime
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import func
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.rate_limit import SlidingWindowLimiter
from app.models.db_models import DataReport, ProductScan, ProductScanRead
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to decode saved analysis: {e}")
    reports = session.exec(
        select(func.count()).select_from(DataReport).where(DataReport.scan_id == scan.id)
    ).one()
    return analysis.model_copy(update={
        "scan_id": scan.id,
        "report_count": reports,
        "data_source": analysis.data_source or scan.source or "label_scan",
    })


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


class ReportRequest(BaseModel):
    reason: Literal["wrong_name", "wrong_nutrition", "wrong_ingredients", "wrong_claims", "other"]
    details: str = Field("", max_length=500)


report_limiter = SlidingWindowLimiter("reports", 20)


@router.post("/history/{scan_id}/report")
async def report_scan(
    scan_id: int,
    body: ReportRequest,
    session: Session = Depends(get_session),
    _rate_limited: None = Depends(report_limiter),
):
    """Anyone can flag a shared audit as wrong. Reports feed a review queue; no personal data is stored."""
    if not session.get(ProductScan, scan_id):
        raise HTTPException(status_code=404, detail="Scan record not found")
    session.add(DataReport(scan_id=scan_id, reason=body.reason, details=body.details.strip()))
    session.commit()
    count = session.exec(select(func.count()).select_from(DataReport).where(DataReport.scan_id == scan_id)).one()
    return {"success": True, "report_count": count}


class AdminSettings(BaseSettings):
    reports_admin_key: Optional[str] = None
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class ReportRead(BaseModel):
    id: int
    scan_id: int
    product_name: str
    reason: str
    details: str
    created_at: datetime


@router.get("/reports", response_model=List[ReportRead])
async def list_reports(
    x_admin_key: Optional[str] = Header(None),
    limit: int = Query(50, ge=1, le=200),
    session: Session = Depends(get_session),
):
    """Review queue for reported audits. Disabled unless REPORTS_ADMIN_KEY is set."""
    admin_key = AdminSettings().reports_admin_key
    if not admin_key:
        raise HTTPException(status_code=404, detail="Not found")
    if not x_admin_key or not secrets.compare_digest(admin_key, x_admin_key):
        raise HTTPException(status_code=401, detail="Admin key required")
    rows = session.exec(
        select(DataReport, ProductScan.product_name)
        .join(ProductScan, ProductScan.id == DataReport.scan_id)
        .order_by(DataReport.created_at.desc())
        .limit(limit)
    ).all()
    return [
        ReportRead(id=r.id, scan_id=r.scan_id, product_name=name, reason=r.reason,
                   details=r.details, created_at=r.created_at)
        for r, name in rows
    ]
