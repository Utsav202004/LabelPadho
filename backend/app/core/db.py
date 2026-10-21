"""
Database configuration and session management for LabelPadho.

WHY SQLMODEL?
=============
SQLModel is created by Sebastián Ramírez (the creator of FastAPI).
It combines SQLAlchemy (Python's most powerful ORM) with Pydantic.
This means our database models and validation models can share the
exact same class definitions without duplicating code!

For storage, we use SQLite by default:
- Zero installation / zero setup required.
- Stored as a single lightweight file on disk (`labelpadho.db`).
- 100% compatible with PostgreSQL when moving to a larger cloud provider later.
"""

from pathlib import Path
from sqlmodel import SQLModel, create_engine, Session

# Store the database file in backend root or project root
DB_FILE = Path(__file__).resolve().parent.parent.parent / "labelpadho.db"
DATABASE_URL = f"sqlite:///{DB_FILE}"

# connect_args={"check_same_thread": False} is required only for SQLite
# because FastAPI handles requests across multiple async threads.
engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False}
)


def init_db():
    """Create database tables if they do not exist."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency for yielding database sessions."""
    with Session(engine) as session:
        yield session
