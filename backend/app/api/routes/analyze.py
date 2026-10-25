"""
Main analysis endpoint — the core API of LabelPadho.

NEW CONCEPTS:
=============

1. FILE UPLOADS IN FASTAPI
   In your Portfolio Optimizer, you received JSON data in the request body.
   Here, users upload IMAGE FILES. This is different:

   - JSON: Content-Type: application/json → FastAPI parses it automatically
   - Files: Content-Type: multipart/form-data → FastAPI uses UploadFile

   multipart/form-data is like sending a letter with multiple attachments.
   Each "part" has a name and can be a file or a text field.

   FastAPI's `UploadFile` object gives you:
     - .filename  → original filename
     - .content_type → MIME type ("image/jpeg", "image/png")
     - .read()    → reads the file bytes (async)
     - .size      → file size

2. FILE VALIDATION
   Never trust user input. We validate:
   - File type (only images, not PDFs or executables)
   - File size (max 10MB — labels don't need more)
   - Number of files (1-5, not 0 or 100)
   
   This is basic security. Without it, someone could upload a 1GB file
   and crash your server.

3. FORM FIELDS + FILES TOGETHER
   When you send files, you can't use a JSON body (they're different
   content types). Instead, we use Form(...) fields alongside File uploads.
   FastAPI handles this, but you need python-multipart installed.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import Session

from app.core.db import get_session
from app.models.db_models import ProductScan
from app.models.schemas import AnalyzeResponse, ProductAnalysis
from app.services.analyzer import Analyzer
from app.services.gemini_extractor import GeminiExtractor

logger = logging.getLogger(__name__)

router = APIRouter()

# Instantiate services (created once, reused across requests)
extractor = GeminiExtractor()
analyzer = Analyzer()

# Limits
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_FILES = 5
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_label(
    # Primary image (Required): Nutrition Facts table / chart
    nutrition_label: UploadFile = File(
        ...,
        description="Photo of the Nutrition Table / Chart (Required)"
    ),
    # Optional image 1: Ingredients list (if on separate panel)
    ingredients_label: UploadFile | None = File(
        None,
        description="Photo of Ingredients list (Optional - if separate from nutrition chart)"
    ),
    # Optional image 2: Front of package (for name & marketing claims verification)
    front_package: UploadFile | None = File(
        None,
        description="Photo of Front of Package (Optional - used to verify claims like 'Multigrain', 'High Protein')"
    ),
    # Optional manual product name if user doesn't want to snap front photo
    product_name: str | None = Form(
        None,
        description="Product name typed manually (Optional - useful if skipping front photo)"
    ),
    # Optional price for price-per-gram-protein calculations
    price: float | None = Form(
        None,
        description="Product price in INR (Optional - calculates price-per-gram-protein vs eggs/chana)"
    ),
    # Optional user ID for learning system
    user_id: str | None = Form(
        None,
        description="User ID for progressive nutrition learning (Optional)"
    ),
    session: Session = Depends(get_session),
):
    """
    Analyze food label images and return a comprehensive analysis with claim auditing.

    - **nutrition_label**: Photo showing the nutrition facts table (Required)
    - **ingredients_label**: Photo of ingredients list (Optional if captured in the same photo)
    - **front_package**: Front photo to audit claims ('100% Atta', 'High Protein', 'No Added Sugar')
    - **product_name**: Manual name input if skipping front photo
    - **price**: Cost in INR to compute price-per-gram macro value
    """

    # ---- Step 1: Collect and validate uploads ----
    active_files: list[UploadFile] = [nutrition_label]
    if ingredients_label is not None:
        active_files.append(ingredients_label)
    if front_package is not None:
        active_files.append(front_package)

    image_bytes_list: list[bytes] = []
    mime_types: list[str] = []

    for f in active_files:
        # Check file type
        if f.content_type not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"File '{f.filename}' has type '{f.content_type}'. "
                    f"Only JPEG, PNG, and WebP images are accepted."
                ),
            )

        # Read file bytes
        content = await f.read()

        # Check file size
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File '{f.filename}' exceeds 10MB limit.",
            )

        image_bytes_list.append(content)
        mime_types.append(f.content_type)

    logger.info(
        f"Received {len(image_bytes_list)} image(s) for analysis. "
        f"Price: {'₹' + str(price) if price else 'not provided'}, "
        f"Manual Name: {product_name or 'None'}"
    )

    # ---- Step 2: Extract data from images using Gemini ----
    try:
        extraction = await extractor.extract(image_bytes_list, mime_types)
        # If user typed a manual product name and extraction didn't find one, apply it
        if product_name and not extraction.product_name:
            extraction.product_name = product_name.strip()
    except Exception as e:
        logger.error(f"Gemini extraction failed: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to extract data from images: {str(e)}",
        )

    # ---- Step 3: Run analysis ----
    # For now, learned_topics is empty (no user tracking yet)
    # In Phase 2, we'll load this from the database
    learned_topics: set[str] = set()

    try:
        analysis = analyzer.analyze(
            extraction=extraction,
            price_inr=price,
            learned_topics=learned_topics,
        )
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}",
        )

    logger.info(
        f"Analysis complete: score={analysis.health_score}, "
        f"flags={len(analysis.ingredient_flags)}, "
        f"edu_notes={len(analysis.educational_notes)}"
    )

    # ---- Step 4: Persist scan record to database ----
    try:
        nutrition = extraction.nutrition_per_serving
        claims_debunked = len([c for c in analysis.claim_verifications if c.status == "debunked"])
        claims_misleading = len([c for c in analysis.claim_verifications if c.status == "misleading"])
        has_cal_discrepancy = bool(
            analysis.math_verification and analysis.math_verification.is_discrepant
        )

        scan_record = ProductScan(
            user_id=user_id,
            product_name=extraction.product_name or product_name or "Food Product",
            product_category=analysis.product_category.value if analysis.product_category else "general_packaged",
            brand=extraction.brand,
            price_inr=price,
            health_score=analysis.health_score,
            one_line_summary=analysis.one_line_summary,
            protein_per_serving_g=nutrition.protein_g,
            serving_size_g=nutrition.serving_size_g,
            calories_per_serving=nutrition.energy_kcal,
            sodium_per_serving_mg=nutrition.sodium_mg,
            sugar_per_serving_g=nutrition.sugar_g,
            price_per_g_protein=(
                analysis.price_analysis.price_per_g_protein
                if analysis.price_analysis else None
            ),
            flag_count=len(analysis.ingredient_flags),
            debunked_claims_count=claims_debunked,
            misleading_claims_count=claims_misleading,
            has_calorie_discrepancy=has_cal_discrepancy,
            full_analysis_json=analysis.model_dump_json(),
        )
        session.add(scan_record)
        session.commit()
        logger.info(f"Saved scan record #{scan_record.id} for '{scan_record.product_name}'")
    except Exception as e:
        logger.error(f"Failed to persist scan record to database: {e}")
        # We don't fail the user response if database persistence encountered an issue

    return AnalyzeResponse(success=True, analysis=analysis)
