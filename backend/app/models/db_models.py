"""
Database models for persisting scan history in LabelPadho.

WHY SQLMODEL TABLE MODELS?
=========================
In SQLModel, adding `table=True` to a class turns it into both:
1. A database table schema (SQLAlchemy)
2. A data validation model (Pydantic)

We serialize complex nested objects (ingredient flags, claim verifications,
and raw nutrition data) as JSON strings into SQLite. This gives us the
power of relational queries (filtering by user, date, health score, price)
while keeping the flexibility of document storage.
"""

from datetime import datetime, timezone
import json
from typing import Optional
from sqlmodel import SQLModel, Field


class ProductScan(SQLModel, table=True):
    """Represents a saved food label scan and audit record."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[str] = Field(default=None, index=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True
    )

    # Core Identifiers
    product_name: str = Field(index=True)
    brand: Optional[str] = Field(default=None)
    price_inr: Optional[float] = Field(default=None)
    health_score: Optional[int] = Field(default=None)
    one_line_summary: str = Field(default="")

    # Key Quantitative Metrics for rapid querying & comparison
    protein_per_serving_g: Optional[float] = Field(default=None)
    serving_size_g: Optional[float] = Field(default=None)
    calories_per_serving: Optional[float] = Field(default=None)
    sodium_per_serving_mg: Optional[float] = Field(default=None)
    sugar_per_serving_g: Optional[float] = Field(default=None)
    price_per_g_protein: Optional[float] = Field(default=None)

    # Verification counts (for quick badge display in history view)
    flag_count: int = Field(default=0)
    debunked_claims_count: int = Field(default=0)
    misleading_claims_count: int = Field(default=0)
    has_calorie_discrepancy: bool = Field(default=False)

    # Full JSON snapshot of the ProductAnalysis response
    # This allows restoring the complete detailed audit without re-running AI
    full_analysis_json: str = Field(default="{}")


class ProductScanRead(SQLModel):
    """Lightweight schema returned for list-view history cards."""
    id: int
    user_id: Optional[str] = None
    created_at: datetime
    product_name: str
    brand: Optional[str] = None
    price_inr: Optional[float] = None
    health_score: Optional[int] = None
    one_line_summary: str
    protein_per_serving_g: Optional[float] = None
    calories_per_serving: Optional[float] = None
    price_per_g_protein: Optional[float] = None
    flag_count: int
    debunked_claims_count: int
    misleading_claims_count: int
    has_calorie_discrepancy: bool
