"""Tests for catalog features: naming, sub-categories, MRP pricing, multi-use packs,
rename-with-token, suggestions, alternatives and the column migration.
No Gemini calls; the API runs against an in-memory SQLite database."""

import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

os.environ.setdefault("GEMINI_API_KEY", "test-key-not-used")

from app.core import db as db_module  # noqa: E402
from app.core.db import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models.db_models import ProductScan  # noqa: E402
from app.models.schemas import LabelExtraction, NutritionInfo, ProductCategory  # noqa: E402
from app.services.analyzer import Analyzer, sanitize_extraction  # noqa: E402
from app.services.naming import display_name, standardize_name  # noqa: E402


# --- Naming --------------------------------------------------------------------

@pytest.mark.parametrize("raw, expected", [
    ("BOURBON", "Bourbon"),
    ("MINI CAKE", "Mini Cake"),
    ("mini cake", "Mini Cake"),
    ("HALDIRAM'S", "Haldiram's"),
    ("KTC", "KTC"),
    ("2-MINUTE MASALA", "2-Minute Masala"),
    ("BREAD AND BUTTER", "Bread and Butter"),
    ("NutriChoice", "NutriChoice"),
    ("Aloo  Bhujia 150G", "Aloo Bhujia 150g"),
    ("   ", None),
    (None, None),
])
def test_standardize_name(raw, expected):
    assert standardize_name(raw) == expected


def test_display_name_does_not_repeat_brand_or_variant():
    assert display_name("Britannia", "Bourbon", "Chocolate Cream") == "Britannia Bourbon (Chocolate Cream)"
    assert display_name("Haldiram's", "Haldiram's Aloo Bhujia", None) == "Haldiram's Aloo Bhujia"


def test_sanitize_standardises_names_and_validates_sub_category():
    extraction = LabelExtraction(
        product_name="BOURBON", brand="BRITANNIA", variant="CHOCOLATE CREAM",
        product_category=ProductCategory.DESSERT_SWEET, sub_category="Biscuit_Cookie",
    )
    fixed = sanitize_extraction(extraction)
    assert (fixed.brand, fixed.product_name, fixed.variant) == ("Britannia", "Bourbon", "Chocolate Cream")
    assert fixed.sub_category == "biscuit_cookie"

    wrong_shelf = LabelExtraction(product_category=ProductCategory.DESSERT_SWEET, sub_category="ketchup_sauce")
    assert sanitize_extraction(wrong_shelf).sub_category is None


# --- Pricing: MRP vs price paid ---------------------------------------------------

def _protein_bar(**extra):
    return LabelExtraction(
        product_name="Protein Bar", net_weight_g=60, product_category=ProductCategory.PROTEIN_FITNESS,
        nutrition_per_serving=NutritionInfo(serving_size_g=60, servings_per_package=1, protein_g=20, energy_kcal=240),
        **extra,
    )


def test_price_uses_mrp_when_user_gives_no_price():
    price = Analyzer().price_analysis_for(_protein_bar(mrp_inr=100), None)
    assert price.price_source == "mrp"
    assert price.price_inr == 100
    assert price.price_per_g_protein == pytest.approx(5.0)


def test_price_paid_overrides_mrp_and_reports_discount():
    price = Analyzer().price_analysis_for(_protein_bar(mrp_inr=100), 80)
    assert price.price_source == "paid"
    assert price.price_inr == 80
    assert price.discount_pct == 20.0


def test_no_price_at_all_gives_no_price_analysis():
    assert Analyzer().price_analysis_for(_protein_bar(), None) is None


# --- Multi-use packs (ketchup) -------------------------------------------------------

def test_ketchup_bottle_is_judged_per_serving_not_whole_bottle():
    ketchup = LabelExtraction(
        product_name="Tomato Ketchup", net_weight_g=950, product_category=ProductCategory.CONDIMENT_SAUCE,
        nutrition_per_serving=NutritionInfo(serving_size_g=15, servings_per_package=63, sugar_g=3.8, sodium_mg=180),
    )
    text_out = Analyzer().analyze(ketchup).serving_reality.realistic_consumption
    assert "multi-use" in text_out
    assert "One 15g serving has 3.8g sugar, 180mg sodium" in text_out
    assert "The full packet has" not in text_out


def test_single_sitting_snack_still_warns_for_full_packet():
    chips = LabelExtraction(
        product_name="Chips", net_weight_g=150, product_category=ProductCategory.SAVORY_SNACK,
        nutrition_per_serving=NutritionInfo(serving_size_g=30, servings_per_package=5, sodium_mg=300),
    )
    assert "The full packet has 1500mg" in Analyzer().analyze(chips).serving_reality.realistic_consumption


# --- API: rename, suggestions, alternatives ---------------------------------------

@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    def override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = override
    now = datetime.now(timezone.utc)
    with Session(engine) as s:
        rows = [
            ProductScan(product_name="Bourbon", brand="Britannia", variant="Chocolate Cream",
                        product_category="dessert_sweet", sub_category="biscuit_cookie", health_score=3,
                        edit_token="secret-token-123", created_at=now),
            ProductScan(product_name="Marie Gold", brand="Britannia", product_category="dessert_sweet",
                        sub_category="biscuit_cookie", health_score=5, created_at=now - timedelta(hours=1)),
            ProductScan(product_name="Digestive", brand="McVitie's", product_category="dessert_sweet",
                        sub_category="biscuit_cookie", health_score=6, created_at=now - timedelta(hours=2)),
            ProductScan(product_name="Dark Chocolate", brand="Amul", product_category="dessert_sweet",
                        sub_category="chocolate", health_score=8, created_at=now - timedelta(hours=3)),
            ProductScan(product_name="Rasgulla", brand="Haldiram's", product_category="dessert_sweet",
                        sub_category="mithai", health_score=4, created_at=now - timedelta(hours=4)),
        ]
        s.add_all(rows)
        s.commit()
        ids = {r.product_name: r.id for r in rows}
    yield TestClient(app), ids
    app.dependency_overrides.clear()


def test_rename_requires_the_scanners_token(client):
    c, ids = client
    url = f"/api/history/{ids['Bourbon']}"
    denied = c.patch(url, json={"edit_token": "wrong-token-000", "product_name": "Hacked"})
    assert denied.status_code == 403

    ok = c.patch(url, json={"edit_token": "secret-token-123", "product_name": "GIMI GIMI BISCUIT",
                            "brand": "gimi gimi", "variant": ""})
    assert ok.status_code == 200
    body = ok.json()
    assert (body["product_name"], body["brand"], body["variant"]) == ("Gimi Gimi Biscuit", "Gimi Gimi", None)
    assert "edit_token" not in body


def test_suggestions_lists_latest_products_without_tokens(client):
    c, _ = client
    data = c.get("/api/products/suggestions", params={"limit": 3}).json()
    assert [d["product_name"] for d in data] == ["Bourbon", "Marie Gold", "Digestive"]
    assert all("edit_token" not in d for d in data)


def test_search_matches_variant(client):
    c, _ = client
    assert [d["product_name"] for d in c.get("/api/products/search", params={"q": "chocolate cream"}).json()] == ["Bourbon"]


def test_alternatives_compare_within_same_shelf(client):
    c, ids = client
    data = c.get(f"/api/products/{ids['Bourbon']}/alternatives").json()
    assert data["scope"] == "sub_category"
    assert data["scope_label"] == "Biscuits & Cookies"
    assert [b["product_name"] for b in data["better"]] == ["Digestive", "Marie Gold"]
    assert (data["rank"], data["total"]) == (3, 3)  # chocolate & mithai are not compared


def test_alternatives_fall_back_to_category_when_shelf_is_empty(client):
    c, ids = client
    data = c.get(f"/api/products/{ids['Rasgulla']}/alternatives").json()
    assert data["scope"] == "category"
    assert data["better"][0]["product_name"] == "Dark Chocolate"


# --- Migration ---------------------------------------------------------------------

def test_add_missing_columns_upgrades_an_old_table(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as conn:  # table as it existed before variant/sub_category/mrp/edit_token
        conn.execute(text(
            "CREATE TABLE productscan (id INTEGER PRIMARY KEY, product_name VARCHAR NOT NULL, brand VARCHAR)"
        ))
    monkeypatch.setattr(db_module, "engine", engine)
    db_module.add_missing_columns()
    cols = {c["name"] for c in inspect(engine).get_columns("productscan")}
    assert {"variant", "sub_category", "mrp_inr", "net_weight_g", "edit_token"} <= cols
    db_module.add_missing_columns()  # idempotent
