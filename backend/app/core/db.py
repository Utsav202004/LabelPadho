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

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlmodel import SQLModel, Session, create_engine

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
    """Create database tables if they do not exist."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency for yielding database sessions."""
    with Session(engine) as session:
        yield session
