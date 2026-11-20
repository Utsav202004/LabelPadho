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
from app.core.rate_limit import scan_limiter
from app.models.schemas import AnalyzeResponse, ProductAnalysis
from app.services.analyzer import Analyzer, sanitize_extraction
from app.services.catalog import save_to_catalog
from app.services.gemini_extractor import GeminiExtractor

logger = logging.getLogger(__name__)

router = APIRouter()

# Instantiate services (created once, reused across requests)
extractor = GeminiExtractor()
analyzer = Analyzer()

# Limits
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_CLAIM_PHOTOS = 4  # front + back/side panels that carry marketing claims
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
    # Optional images: Front of package + any other panels with claims (name & claim verification)
    front_package: list[UploadFile] | None = File(
        None,
        description=(
            "Photos of the front of pack and any other panels with marketing claims "
            f"(Optional, up to {MAX_CLAIM_PHOTOS}) - used to verify claims like 'Multigrain', 'High Protein'"
        ),
    ),
    # Optional manual product name if user doesn't want to snap front photo
    product_name: str | None = Form(
        None,
        description="Product name typed manually (Optional - useful if skipping front photo)"
    ),
    # Optional price for price-per-gram-protein calculations
    price: float | None = Form(
        None,
        gt=0,
        description=(
            "Price the user actually paid in INR (Optional). Used only for this response; "
            "the shared catalog stores the MRP read from the label instead."
        ),
    ),
    expected_consumption_g: float | None = Form(
        None,
        gt=0,
        description="How many grams the user expects to eat (Optional; scales nutrition to a realistic portion)"
    ),
    barcode: str | None = Form(
        None,
        description="EAN/UPC barcode digits if the user scanned it (Optional; enables instant lookups later)",
    ),
    # Optional user ID for learning system
    user_id: str | None = Form(
        None,
        description="User ID for progressive nutrition learning (Optional)"
    ),
    session: Session = Depends(get_session),
    _rate_limited: None = Depends(scan_limiter),
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
    claim_photos = [f for f in (front_package or []) if f is not None and f.filename]
    if len(claim_photos) > MAX_CLAIM_PHOTOS:
        raise HTTPException(
            status_code=400,
            detail=f"Please upload at most {MAX_CLAIM_PHOTOS} front/claim photos.",
        )
    active_files.extend(claim_photos)

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
        # Repair per-100g values misread as per-serving etc., so the saved
        # record and the analysis both use corrected numbers
        if barcode and barcode.strip().isdigit() and 8 <= len(barcode.strip()) <= 14:
            extraction.barcode = barcode.strip()
        elif extraction.barcode and not (extraction.barcode.isdigit() and 8 <= len(extraction.barcode) <= 14):
            extraction.barcode = None  # ignore garbled digits read from the photo
        extraction = sanitize_extraction(extraction)
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
            expected_consumption_g=expected_consumption_g,
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

    # ---- Step 4: Persist to the shared catalog (never fail the response over it) ----
    try:
        record, edit_token = save_to_catalog(
            session, analyzer, extraction, analysis,
            source="label_scan", user_id=user_id, fallback_name=product_name,
        )
    except Exception as e:
        logger.error(f"Failed to persist scan record to database: {e}")
        return AnalyzeResponse(success=True, analysis=analysis.model_copy(update={"data_source": "label_scan"}))

    return AnalyzeResponse(
        success=True,
        analysis=analysis.model_copy(update={"scan_id": record.id, "data_source": "label_scan"}),
        scan_id=record.id,
        edit_token=edit_token,
    )
