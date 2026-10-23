"""
LabelPadho — Main FastAPI Application

This is the entry point of the backend server.

NEW CONCEPT: CORS (Cross-Origin Resource Sharing)
=================================================
When your frontend (running on localhost:3000) tries to call your
backend (running on localhost:8000), the browser BLOCKS the request.
Why? Security. By default, a webpage can only talk to the same server
it was loaded from. This is called the "Same-Origin Policy".

But we NEED the frontend to talk to the backend — they're separate
servers. CORS is the mechanism to whitelist which other origins are
allowed to make requests.

Think of it like a bouncer at a club:
- Same-Origin Policy = "only people who live in this building can enter"
- CORS headers = "also let people from building B enter" (we add
  localhost:3000 to the allowed list)

In production, you'd set this to your actual domain. In development,
we allow localhost ports.

Interview note: If asked "how do you handle CORS?", explain:
"I configured CORS middleware with explicit origin whitelisting.
In development, I allow localhost ports. In production, I restrict
it to the actual frontend domain only."
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analyze, health, history
from app.core.db import init_db

# Configure logging so we can see what's happening
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan events — code that runs when the server starts up and shuts down.

    NEW CONCEPT: asynccontextmanager + lifespan
    FastAPI's recommended way to run startup/shutdown code.
    The code BEFORE `yield` runs at startup.
    The code AFTER `yield` runs at shutdown.
    """
    # --- Startup ---
    logger.info("🚀 LabelPadho API starting up...")
    init_db()
    logger.info("✅ Database initialized (SQLite / SQLModel)")
    logger.info("✅ Flagged additives database loaded")
    logger.info("✅ Natural alternatives database loaded")
    yield
    # --- Shutdown ---
    logger.info("👋 LabelPadho API shutting down...")


# Create the FastAPI app instance
app = FastAPI(
    title="LabelPadho API",
    description=(
        "Decode Indian food labels. Upload product images, get nutrition "
        "analysis, ingredient flags, price-per-protein comparisons, and "
        "plain-language health insights."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# --- CORS Middleware ---
# This MUST be added before routes, so it applies to all requests
app.add_middleware(
    CORSMiddleware,
    # Which origins (frontend URLs) are allowed to call this API?
    allow_origins=[
        "http://localhost:3000",    # Next.js dev server
        "http://127.0.0.1:3000",
        "http://localhost:5173",    # Vite dev server (backup)
        "https://labelpadho.utsavgoyal.tech",  # custom domain
        "https://*.vercel.app",
    ],
    # Allow cookies/auth headers to be sent cross-origin
    allow_credentials=True,
    # Allow all HTTP methods (GET, POST, PUT, DELETE, etc.)
    allow_methods=["*"],
    # Allow all headers (Content-Type, Authorization, etc.)
    allow_headers=["*"],
)

# --- Register Routes ---
# We prefix API routes with /api so they don't clash with frontend routes
# Tags group endpoints in the auto-generated docs
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(analyze.router, prefix="/api", tags=["analysis"])
app.include_router(history.router, prefix="/api", tags=["history"])


@app.get("/")
async def root():
    """Root endpoint — redirects to API docs."""
    return {
        "message": "Welcome to LabelPadho API 🔍",
        "docs": "/docs",
        "health": "/api/health",
    }
