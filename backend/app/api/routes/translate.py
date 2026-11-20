"""
POST /api/translate — show an audit in Hindi.

Only the prose is translated; scores, numbers and flags stay exactly as the
deterministic engine produced them. Translations of saved audits are cached
in the catalog, so each product is translated once and served to everyone.
"""

import json
import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session

from app.core.db import get_session
from app.core.rate_limit import client_ip, translate_limiter
from app.models.db_models import ProductScan
from app.models.schemas import ProductAnalysis
from app.services.gemini_extractor import translate_texts
from app.services.translation import LANGUAGES, apply_texts, collect_texts

logger = logging.getLogger(__name__)
router = APIRouter()


class TranslateRequest(BaseModel):
    lang: Literal["hi"] = "hi"
    scan_id: Optional[int] = None  # saved audit (cached)
    analysis: Optional[ProductAnalysis] = None  # e.g. a sample audit that isn't saved


@router.post("/translate", response_model=ProductAnalysis)
async def translate_analysis(
    body: TranslateRequest,
    request: Request,
    session: Session = Depends(get_session),
):
    scan: ProductScan | None = None
    if body.scan_id is not None:
        scan = session.get(ProductScan, body.scan_id)
        if not scan:
            raise HTTPException(status_code=404, detail="Scan record not found")
        cache = json.loads(scan.translations_json or "{}")
        if body.lang in cache:
            return ProductAnalysis.model_validate(cache[body.lang]).model_copy(update={"scan_id": scan.id})
        source = ProductAnalysis.model_validate_json(scan.full_analysis_json)
    elif body.analysis is not None:
        source = body.analysis
    else:
        raise HTTPException(status_code=422, detail="Provide scan_id or analysis")

    # Only cache misses spend Gemini quota, so only they count toward the limit
    translate_limiter.check(client_ip(request))

    # Imported lazily so the module (and its Gemini client) loads only when used
    from app.api.routes.analyze import extractor

    try:
        translated_texts = await translate_texts(extractor, collect_texts(source), LANGUAGES[body.lang])
    except Exception as e:
        logger.error("Translation failed: %s", e)
        raise HTTPException(status_code=502, detail="Translation is unavailable right now. Please try again.")

    translated = apply_texts(source, translated_texts, body.lang)
    if scan is not None:
        cache = json.loads(scan.translations_json or "{}")
        cache[body.lang] = json.loads(translated.model_dump_json())
        scan.translations_json = json.dumps(cache, ensure_ascii=False)
        session.add(scan)
        session.commit()
        translated = translated.model_copy(update={"scan_id": scan.id})
    return translated
