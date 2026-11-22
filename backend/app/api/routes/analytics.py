"""
First-party, privacy-friendly analytics.

- POST /api/events            → the frontend records anonymous usage events
- GET  /api/admin/stats?days=7 → growth numbers for the weekly report (needs ADMIN_KEY)

Why build it instead of using a third-party tool: zero cost, we own the data,
and growth reports (traffic by source, funnel, top products, searches with no
results) come straight from the same database as the product.
"""

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.core.admin import require_admin
from app.core.db import get_session
from app.core.rate_limit import SlidingWindowLimiter
from app.models.db_models import AnalyticsEvent, ProductScan

router = APIRouter()
event_limiter = SlidingWindowLimiter("analytics events", 300)

EventName = Literal[
    "visit", "search", "report_view", "scan_submit", "scan_success", "barcode_lookup",
    "share", "profile_select", "compare_open", "hindi_toggle", "report_wrong_data",
]


class EventIn(BaseModel):
    name: EventName
    session_id: Optional[str] = Field(None, max_length=64)
    product_id: Optional[int] = None
    utm_source: Optional[str] = Field(None, max_length=64)
    utm_medium: Optional[str] = Field(None, max_length=64)
    utm_campaign: Optional[str] = Field(None, max_length=64)
    referrer_host: Optional[str] = Field(None, max_length=128)
    detail: Optional[str] = Field(None, max_length=100)
    value: Optional[int] = None


@router.post("/events", status_code=204)
async def record_event(
    event: EventIn,
    session: Session = Depends(get_session),
    _rate_limited: None = Depends(event_limiter),
):
    """Record one anonymous usage event. Never blocks the user experience."""
    data = event.model_dump()
    for key in ("utm_source", "utm_medium", "utm_campaign", "detail", "referrer_host"):
        if data[key]:
            data[key] = data[key].strip().lower()[:100] or None
    session.add(AnalyticsEvent(**data))
    session.commit()


@router.get("/admin/stats")
async def growth_stats(
    days: int = Query(7, ge=1, le=90),
    session: Session = Depends(get_session),
    _admin: None = Depends(require_admin),
):
    """Growth numbers for the last N days (powers the weekly growth report)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    events = session.exec(select(AnalyticsEvent).where(AnalyticsEvent.created_at >= since)).all()

    by_name = Counter(e.name for e in events)
    sessions_by_event: dict[str, set] = {}
    for e in events:
        if e.session_id:
            sessions_by_event.setdefault(e.name, set()).add(e.session_id)
    visit_sessions = sessions_by_event.get("visit", set())
    engaged = sessions_by_event.get("search", set()) | sessions_by_event.get("report_view", set()) \
        | sessions_by_event.get("barcode_lookup", set()) | sessions_by_event.get("scan_submit", set())

    # Where visitors come from (first visit event of each session)
    source_by_session: dict[str, str] = {}
    for e in sorted(events, key=lambda e: e.created_at):
        if e.name == "visit" and e.session_id and e.session_id not in source_by_session:
            source_by_session[e.session_id] = e.utm_source or e.referrer_host or "direct"
    sources = Counter(source_by_session.values())

    viewed = Counter(e.product_id for e in events if e.name == "report_view" and e.product_id)
    names = {p.id: f"{p.brand or ''} {p.product_name}".strip() for p in session.exec(
        select(ProductScan).where(ProductScan.id.in_(list(viewed)))
    ).all()} if viewed else {}
    searches = Counter(e.detail for e in events if e.name == "search" and e.detail)
    no_result = Counter(e.detail for e in events if e.name == "search" and e.detail and e.value == 0)
    shares = Counter(e.detail or "unknown" for e in events if e.name == "share")

    new_products = session.exec(select(ProductScan).where(ProductScan.created_at >= since)).all()
    return {
        "period_days": days,
        "visitors": len(visit_sessions),
        "engaged_visitors": len(engaged & visit_sessions) if visit_sessions else len(engaged),
        "products_checked": by_name["search"] + by_name["report_view"] + by_name["barcode_lookup"] + by_name["scan_success"],
        "events": dict(by_name),
        "traffic_sources": dict(sources.most_common(10)),
        "top_products_viewed": [{"id": pid, "name": names.get(pid, str(pid)), "views": n} for pid, n in viewed.most_common(10)],
        "top_searches": dict(searches.most_common(15)),
        "searches_with_no_results": dict(no_result.most_common(15)),
        "shares_by_channel": dict(shares),
        "new_products_added": len(new_products),
        "catalog_size": len(session.exec(select(ProductScan.id)).all()),
    }
