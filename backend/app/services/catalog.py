"""Saving audits into the shared product catalog (used by label scans and barcode lookups)."""

import logging
import secrets

from sqlmodel import Session

from app.models.db_models import ProductScan
from app.models.schemas import LabelExtraction, ProductAnalysis
from app.services.analyzer import Analyzer

logger = logging.getLogger(__name__)


def save_to_catalog(
    session: Session,
    analyzer: Analyzer,
    extraction: LabelExtraction,
    analysis: ProductAnalysis,
    source: str,
    user_id: str | None = None,
    fallback_name: str | None = None,
) -> tuple[ProductScan, str]:
    """
    Persist an audit and return (record, edit_token).

    The saved copy is priced at MRP (a product fact). What a user paid is
    personal (shop, city, offer), so it is shown to them but never stored.
    """
    stored = analysis.model_copy(update={
        "price_analysis": analyzer.price_analysis_for(extraction, None),
        "data_source": source,
    })
    nutrition = extraction.nutrition_per_serving
    edit_token = secrets.token_urlsafe(24)
    record = ProductScan(
        user_id=user_id,
        product_name=extraction.product_name or fallback_name or "Food Product",
        product_category=analysis.product_category.value if analysis.product_category else "general_packaged",
        sub_category=analysis.sub_category,
        brand=extraction.brand,
        variant=extraction.variant,
        mrp_inr=extraction.mrp_inr,
        net_weight_g=extraction.net_weight_g,
        barcode=extraction.barcode,
        source=source,
        price_inr=extraction.mrp_inr,
        health_score=analysis.health_score,
        one_line_summary=analysis.one_line_summary,
        protein_per_serving_g=nutrition.protein_g,
        serving_size_g=nutrition.serving_size_g,
        calories_per_serving=nutrition.energy_kcal,
        sodium_per_serving_mg=nutrition.sodium_mg,
        sugar_per_serving_g=nutrition.sugar_g,
        price_per_g_protein=stored.price_analysis.price_per_g_protein if stored.price_analysis else None,
        flag_count=len(analysis.ingredient_flags),
        debunked_claims_count=sum(c.status == "debunked" for c in analysis.claim_verifications),
        misleading_claims_count=sum(c.status == "misleading" for c in analysis.claim_verifications),
        has_calorie_discrepancy=bool(analysis.math_verification and analysis.math_verification.is_discrepant),
        full_analysis_json=stored.model_dump_json(),
        edit_token=edit_token,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    logger.info("Saved catalog record #%s for '%s' (%s)", record.id, record.product_name, source)
    return record, edit_token
