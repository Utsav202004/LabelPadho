"""
Database configuration and session management for LabelPadho.

WHY SQLMODEL?
=============
SQLModel is created by Sebastián Ramírez (the creator of FastAPI).
It combines SQLAlchemy (Python's most powerful ORM) with Pydantic.
This means our database models and validation models can share the
exact same class definitions without duplicating code!

SHARED PRODUCT CATALOG (HOSTED POSTGRES)
========================================
Every scanned product is saved once and becomes searchable by every user.
For that to survive restarts/redeploys, production points DATABASE_URL at a
hosted Postgres (e.g. Neon free tier). Free app hosts like Render wipe the
local disk on every deploy, so a SQLite file there would silently lose data.

- DATABASE_URL set   → hosted Postgres (shared, persistent)
- DATABASE_URL unset → local SQLite file (zero-setup local development)

Same SQLModel code runs on both; only the connection string changes.
"""

import json
import logging
from pathlib import Path

from sqlalchemy import inspect, text

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlmodel import SQLModel, Session, create_engine, select

logger = logging.getLogger(__name__)

# Local fallback: SQLite file in the backend/ folder
DB_FILE = Path(__file__).resolve().parent.parent.parent / "labelpadho.db"
SQLITE_URL = f"sqlite:///{DB_FILE}"


class DatabaseSettings(BaseSettings):
    """Kept separate from the main Settings so DB access never needs the Gemini key (e.g. in tests)."""

    database_url: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


def normalize_database_url(url: str | None) -> str:
    """
    Turn whatever the hosting provider gives us into a SQLAlchemy URL.

    Neon / Supabase / Render hand out `postgres://` or `postgresql://` URLs;
    SQLAlchemy needs the driver spelled out, and we use psycopg (v3).
    """
    if not url or not url.strip():
        return SQLITE_URL
    url = url.strip()
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = normalize_database_url(DatabaseSettings().database_url)
IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    # check_same_thread=False is required only for SQLite
    # because FastAPI handles requests across multiple threads.
    engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        DATABASE_URL,
        echo=False,
        # Serverless Postgres (Neon) suspends idle compute and drops connections;
        # pre_ping transparently replaces dead pooled connections.
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=5,
    )


def init_db():
    """Create tables, add any columns new code expects, and tidy existing names."""
    # Import here so the table is registered on SQLModel.metadata
    from app.models import db_models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    add_missing_columns()
    standardize_existing_names()
    clean_saved_reports()
    recheck_seeded_reports()


def add_missing_columns():
    """
    Tiny forward-only migration.

    `create_all` creates missing TABLES but never adds new COLUMNS to an
    existing table (e.g. the live Neon table created before `variant` existed).
    For each model column missing in the database, run ALTER TABLE ... ADD
    COLUMN. Only nullable columns are ever added, so existing rows stay valid.
    A real team would use Alembic; this keeps a solo project dependency-free.
    """
    inspector = inspect(engine)
    for table in SQLModel.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        existing = {col["name"] for col in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing or not column.nullable:
                continue
            col_type = column.type.compile(dialect=engine.dialect)
            with engine.begin() as conn:
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}'))
            logger.info("Added column %s.%s (%s)", table.name, column.name, col_type)


def standardize_existing_names():
    """One-time-ish backfill: apply name standardisation to rows saved before it existed (idempotent)."""
    from app.models.db_models import ProductScan
    from app.services.naming import standardize_name

    with Session(engine) as session:
        changed = 0
        for scan in session.exec(select(ProductScan)).all():
            new_name = standardize_name(scan.product_name) or scan.product_name
            new_brand = standardize_name(scan.brand)
            if new_name == scan.product_name and new_brand == scan.brand:
                continue
            scan.product_name, scan.brand = new_name, new_brand
            try:
                data = json.loads(scan.full_analysis_json or "{}")
                if isinstance(data.get("extraction"), dict):
                    data["extraction"]["product_name"] = new_name
                    data["extraction"]["brand"] = new_brand
                    scan.full_analysis_json = json.dumps(data)
            except json.JSONDecodeError:
                pass
            session.add(scan)
            changed += 1
        if changed:
            session.commit()
            logger.info("Standardised names on %d existing scan(s)", changed)


def clean_saved_reports():
    """
    Reports are generated once and saved, so wording changes don't reach old
    ones. Bring saved reports up to date (idempotent; only touches rows that change):
    - strip emojis / outdated phrasings from the report text and cached translations
    - re-clean Open Food Facts names; drop seeded rows whose "name" was just a barcode
    """
    from app.models.db_models import DataReport, ProductScan
    from app.services.naming import clean_display_text, clean_report_data
    from app.services.open_food_facts import clean_off_name

    with Session(engine) as session:
        changed = removed = 0
        for scan in session.exec(select(ProductScan)).all():
            if scan.source == "open_food_facts":
                name = clean_off_name(scan.product_name or "")
                if name is None:
                    for report in session.exec(select(DataReport).where(DataReport.scan_id == scan.id)).all():
                        session.delete(report)
                    session.delete(scan)
                    removed += 1
                    continue
            else:
                name = scan.product_name

            dirty = False
            for field in ("full_analysis_json", "translations_json"):
                raw = getattr(scan, field)
                if not raw:
                    continue
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                cleaned = clean_report_data(data)
                if field == "full_analysis_json" and isinstance(cleaned.get("extraction"), dict):
                    cleaned["extraction"]["product_name"] = name
                if cleaned != data:
                    setattr(scan, field, json.dumps(cleaned, ensure_ascii=False))
                    dirty = True
            summary = clean_display_text(scan.one_line_summary or "")
            if name != scan.product_name or summary != scan.one_line_summary:
                scan.product_name, scan.one_line_summary = name, summary
                dirty = True
            if dirty:
                session.add(scan)
                changed += 1
        if changed or removed:
            session.commit()
            logger.info("Cleaned %d saved report(s); removed %d unnamed seeded product(s)", changed, removed)


def recheck_seeded_reports():
    """
    Re-run seeded (Open Food Facts) reports through the current sanity checks.

    Crowd-sourced data had unit errors (sodium in g entered as mg) and drink
    powders filed as soft drinks. Each saved report keeps its extraction, so it
    can be re-checked and re-scored without any network call. Only rows whose
    data actually changes are rewritten (idempotent).
    """
    from app.models.db_models import ProductScan
    from app.models.schemas import LabelExtraction
    from app.services.analyzer import Analyzer, sanitize_extraction
    from app.services.open_food_facts import name_first_category

    analyzer = Analyzer()
    with Session(engine) as session:
        changed = 0
        rows = session.exec(select(ProductScan).where(ProductScan.source == "open_food_facts")).all()
        for scan in rows:
            try:
                data = json.loads(scan.full_analysis_json or "{}")
                extraction = LabelExtraction.model_validate(data.get("extraction") or {})
            except Exception:  # noqa: BLE001 - skip anything unreadable
                continue
            remapped = extraction
            if (by_name := name_first_category(extraction.product_name)) is not None and (
                extraction.product_category, extraction.sub_category
            ) != by_name:
                remapped = extraction.model_copy(update={"product_category": by_name[0], "sub_category": by_name[1]})
            fixed = sanitize_extraction(remapped)
            if fixed == extraction:
                # Data unchanged; still re-score reports without ingredients so they say so honestly
                if extraction.ingredients:
                    continue
                if analyzer.analyze(fixed).one_line_summary == scan.one_line_summary:
                    continue
            apply_rescore(scan, fixed, analyzer)
            session.add(scan)
            changed += 1
        if changed:
            session.commit()
            logger.info("Re-checked and re-scored %d seeded report(s)", changed)


def apply_rescore(scan, extraction, analyzer) -> None:
    """Re-analyse a seeded scan from its extraction and write the result back onto the row (caller commits)."""
    analysis = analyzer.analyze(extraction).model_copy(update={"price_analysis": None, "data_source": "open_food_facts"})
    n = extraction.nutrition_per_serving
    scan.full_analysis_json = analysis.model_dump_json()
    scan.translations_json = None  # cached Hindi no longer matches
    scan.product_category = analysis.product_category.value
    scan.sub_category = analysis.sub_category
    scan.health_score = analysis.health_score
    scan.one_line_summary = analysis.one_line_summary
    scan.sodium_per_serving_mg = n.sodium_mg
    scan.sugar_per_serving_g = n.sugar_g
    scan.flag_count = len(analysis.ingredient_flags)


def get_session():
    """FastAPI dependency for yielding database sessions."""
    with Session(engine) as session:
        yield session
