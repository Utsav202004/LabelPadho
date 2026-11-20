"""Tests for product search over saved scans (no Gemini calls, in-memory SQLite)."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.api.routes.products import search_scans
from app.models.db_models import ProductScan


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    now = datetime.now(timezone.utc)
    with Session(engine) as s:
        s.add_all([
            ProductScan(product_name="Maggi 2-Minute Noodles", brand="Nestle", created_at=now - timedelta(days=2)),
            ProductScan(product_name="maggi 2-minute noodles", brand="Nestle", created_at=now),
            ProductScan(product_name="Whey Protein", brand="Amul", created_at=now - timedelta(days=1)),
            ProductScan(product_name="100% Atta Bread", brand=None, created_at=now - timedelta(days=3)),
            ProductScan(product_name="Aloo Bhujia", brand="Haldiram's", created_at=now - timedelta(days=4)),
            ProductScan(product_name="Classic Salted", brand="Lay's", created_at=now - timedelta(days=5)),
            ProductScan(product_name="Bourbon", brand="Britannia", created_at=now - timedelta(days=6)),
        ])
        s.commit()
        yield s


def test_matches_name_case_insensitive_and_dedupes_to_latest(session):
    results = search_scans(session, "MAGGI", limit=10)
    assert len(results) == 1
    assert results[0].product_name == "maggi 2-minute noodles"


def test_words_can_match_brand_or_name(session):
    results = search_scans(session, "amul whey", limit=10)
    assert [r.product_name for r in results] == ["Whey Protein"]


def test_all_words_must_match(session):
    assert search_scans(session, "amul noodles", limit=10) == []


def test_like_wildcards_are_literal(session):
    assert [r.product_name for r in search_scans(session, "100%", limit=10)] == ["100% Atta Bread"]
    assert search_scans(session, "_", limit=10) == []


def test_blank_query_returns_nothing(session):
    assert search_scans(session, "   ", limit=10) == []



@pytest.mark.parametrize("query, expected", [
    ("bhujiya", "Aloo Bhujia"),     # Hinglish spelling
    ("magi", "maggi 2-minute noodles"),  # missing double letter
    ("lays", "Classic Salted"),      # apostrophe in brand
    ("burbon", "Bourbon"),          # typo
    ("haldirams bhujia", "Aloo Bhujia"),
])
def test_typo_tolerant_search(session, query, expected):
    names = [r.product_name for r in search_scans(session, query, limit=5)]
    assert expected in names


def test_fuzzy_search_does_not_match_unrelated_words(session):
    assert search_scans(session, "chocolate", limit=5) == []
    assert search_scans(session, "amul noodles", limit=5) == []
