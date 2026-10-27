"""
Gemini Multimodal Extraction Service

This is the brain of LabelPadho — it sends food label images to Google's
Gemini AI and gets back structured nutrition data.

NEW CONCEPTS FOR YOU:
=====================

1. MULTIMODAL AI
   You know LLMs like ChatGPT that take text in → text out.
   "Multimodal" means the model can process MULTIPLE types of input:
   text + images + audio + video. Gemini is multimodal.
   
   For us: we send food label IMAGES + a text prompt → Gemini "reads"
   the label and returns structured data. No separate OCR step needed.
   
   Interview answer: "I chose direct multimodal extraction over a
   separate OCR→LLM pipeline because Gemini can understand the visual
   layout of nutrition tables, not just extract raw text. This gives
   better accuracy on Indian labels with mixed Hindi/English text and
   non-standard table formats."

2. STRUCTURED OUTPUT (response_schema)
   Normally, an LLM returns free-form text. You'd have to parse it
   yourself, and it might not be valid JSON, or it might miss fields.
   
   Gemini's "structured output" feature lets you pass a Pydantic schema,
   and Gemini GUARANTEES its output will match that schema. Under the
   hood, it constrains the model's token generation to only produce
   valid JSON matching your schema.
   
   This is like telling a contractor "fill out THIS form" vs "tell me
   about the building" — the form guarantees you get structured data.
   
   Interview answer: "I used Gemini's structured output with Pydantic
   schemas to guarantee type-safe extraction. This eliminated the need
   for manual JSON parsing or regex-based extraction, and reduced
   malformed output errors to near zero."

3. PROMPT ENGINEERING
   The prompt we send to Gemini is carefully designed:
   - Specific role assignment ("You are a food label analysis expert")
   - Clear instructions on what to extract
   - Context about Indian food labels specifically
   - Edge case handling (mixed languages, partial data)
   
   This is a real skill that interviewers ask about. The difference
   between a good and bad prompt can be 30-40% accuracy difference.

4. ASYNC/AWAIT
   You've used os.fork() for parallelism. async/await is Python's way
   of handling I/O-bound concurrency (waiting for network responses).
   
   When we call Gemini's API, we wait ~2-5 seconds for a response.
   With sync code, the server is BLOCKED during that wait — can't
   handle other requests. With async, the server handles other
   requests while waiting.
   
   Think of it like: sync = you stand at the counter waiting for your
   order. async = you give your number, sit down, and the counter
   serves others until your order is ready.
   
   FastAPI natively supports async, which is why we use it.
"""

import asyncio
import io
import logging
from pathlib import Path

from PIL import Image
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

from google import genai
from google.genai import types

from app.core.config import settings
from app.models.schemas import LabelExtraction

logger = logging.getLogger(__name__)

# Fallback cascade: if primary is experiencing temporary 503 high demand,
# automatically failover to alternate available models without crashing
MODEL_CASCADE = [
    settings.gemini_model,
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
]

# ============================================================
# The extraction prompt — this is critical for accuracy
# ============================================================

EXTRACTION_PROMPT = """You are an expert at reading and analyzing Indian packaged food labels.

You are given one or more images of a food product's packaging. These images may include:
- The nutrition facts table / nutrition information panel
- The ingredients list
- The front of the package (with product name, brand, marketing claims)
- The back or side panel with additional details

Your job is to EXTRACT all information from these images into a structured format.

IMPORTANT GUIDELINES:
1. Extract values EXACTLY as printed. Do not round, estimate, or calculate.
2. Ingredients must be listed in the ORDER they appear on the label (first = highest quantity).
3. If a value is not visible, not legible, or not present, use null.
4. Indian labels often show nutrition per serving AND per 100g — extract both if available.
5. The label may be in English, Hindi, or mixed — extract everything regardless of language.
6. Look for ALL marketing claims on the front, back, and sides of the package.
   Examples: "No Palm Oil", "Zero Palm Oil", "Source of Protein", "Source of Fibre", "Good Source of Fiber",
   "Cholesterol Free", "0% Cholesterol", "No Added Preservatives", "Preservative Free", "Zero Trans Fat",
   "High Protein", "No Added Sugar", "Baked Not Fried", "100% Whole Wheat", "Multigrain".
   Always extract every single claim found into the `claims` list.
7. Pay special attention to:
   - Serving size vs package size (labels often use tiny serving sizes)
   - The exact serving wording (for example, "1 biscuit" or "2 cookies") in `serving_unit_description`
   - Trans fat content (may be hidden or listed as 0 due to rounding)
   - Type of oil used (often buried in ingredients list)
   - FSSAI license number if visible
8. If the ingredient list mentions "edible vegetable oil" without specifying type, note it as-is.
9. Percentage values next to ingredients (e.g., "Wheat flour (65%)") should be captured.
   - Always capture the product name exactly as printed, including words such as "creme" or "crème".
10. CATEGORY CLASSIFICATION:
    Classify the product into ONE of these exact categories:
    - 'protein_fitness': Whey, protein bars, peanut butter, dedicated high-protein snacks
    - 'staple_grain': Atta, rice, oats, whole-grain breads, plain breakfast cereals
    - 'dessert_sweet': Chocolates, sweets/mithai, sweet biscuits, cakes, ice creams
    - 'savory_snack': Chips, namkeen, bhujia, popcorn, instant noodles, fried snacks
    - 'beverage_juice': Fruit juices, fruit pulps, nectars
    - 'beverage_soda': Carbonated drinks, colas, energy drinks, sweetened fizzy beverages
    - 'dairy_dairy_alt': Plain milk, curd/dahi, paneer, tofu, soya milk
    - 'condiment_sauce': Ketchup, mayo, dips, dressings, jams
    - 'general_packaged': Any food not fitting the above
    Provide a concise `category_reasoning` explaining your classification.
11. DYNAMIC MARKETING CLAIM AUDIT (`raw_claims_audit`):
    For EVERY marketing claim visible on the packaging (e.g. "Loaded with Nuts", "No Added Maida", "Power of Protein & Fibre", "Source of Calcium", "100% Real", "Guilt Free"):
    Cross-examine it against the actual ingredients list and nutrition numbers:
    - If claim says "Loaded with Nuts", check declared nut percentages in ingredients (e.g., Almonds 2%).
    - If claim says "No Added Maida", check if refined starches, maltodextrin, or refined flours are substituted.
    - If claim says "Protein/Fibre Rich", check actual grams in the nutrition table.
    - Assign status ('verified', 'misleading', or 'debunked') with a concise 1-sentence reality check.
"""


class GeminiExtractor:
    """
    Sends food label images to Gemini and gets structured data back.
    Includes automatic HEIC/PNG transcoding and multi-model failover.
    """

    def __init__(self):
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.primary_model = settings.gemini_model

    def _normalize_image(self, raw_bytes: bytes) -> tuple[bytes, str]:
        """
        Normalize any incoming image (including Apple HEIC, TIFF, PNG)
        to a compressed, standardized JPEG. Resizes ultra-high-res images
        to max 1400px to optimize bandwidth, tokens, and inference latency.
        """
        try:
            image = Image.open(io.BytesIO(raw_bytes))
            # Convert RGBA / CMYK to RGB
            if image.mode != "RGB":
                image = image.convert("RGB")

            # Downscale if wider/taller than 1400px while keeping aspect ratio
            max_dim = 1400
            if max(image.size) > max_dim:
                image.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=75, optimize=True)
            return buffer.getvalue(), "image/jpeg"
        except Exception as e:
            logger.warning(f"Image normalization failed ({e}); using raw bytes")
            return raw_bytes, "image/jpeg"

    async def extract(
        self,
        image_bytes_list: list[bytes],
        mime_types: list[str],
    ) -> LabelExtraction:
        """
        Extract structured nutrition data from food label images.
        Uses asyncio.to_thread to avoid blocking FastAPI's event loop.
        Cascades cleanly through fallback models without hanging.
        """
        contents: list[types.Part | str] = []

        # 1. Normalize all images to clean JPEG parts (1400px max, quality 75)
        for raw_bytes in image_bytes_list:
            norm_bytes, norm_mime = self._normalize_image(raw_bytes)
            contents.append(
                types.Part.from_bytes(
                    data=norm_bytes,
                    mime_type=norm_mime,
                )
            )

        contents.append(EXTRACTION_PROMPT)

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=LabelExtraction,
            temperature=0.1,
        )

        last_error = None

        # Helper function for non-blocking execution in worker thread
        def _call_model(m_name: str):
            return self.client.models.generate_content(
                model=m_name,
                contents=contents,
                config=config,
            )

        # 2. Iterate through model cascade
        for model_name in MODEL_CASCADE:
            try:
                logger.info(f"Dispatching extraction request to model '{model_name}'...")
                # Run synchronous GenAI call in a worker thread with 35s timeout
                response = await asyncio.wait_for(
                    asyncio.to_thread(_call_model, model_name),
                    timeout=35.0,
                )

                raw_text = response.text
                if not raw_text:
                    raise ValueError("Empty response received from model")

                extraction = LabelExtraction.model_validate_json(raw_text)
                logger.info(
                    f"Extraction succeeded using '{model_name}': "
                    f"{extraction.product_name or 'Unknown Product'}"
                )
                return extraction

            except Exception as e:
                last_error = e
                logger.warning(f"Model '{model_name}' failed or timed out: {e}")
                continue

        # If all models in the cascade failed, raise the final error
        raise RuntimeError(
            f"All available vision models failed. Last error: {last_error}"
        )

