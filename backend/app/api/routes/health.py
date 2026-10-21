"""
Health check endpoint.

Every production API should have a /health endpoint that returns
a simple "I'm alive" response. This is used by:
- Deployment platforms (Railway, Render) to know your app is running
- Load balancers to route traffic only to healthy instances
- Monitoring tools to alert you if the app goes down

It should be fast, do minimal work, and always return 200 OK.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """Simple health check — returns 200 if the server is running."""
    return {"status": "healthy", "service": "LabelPadho API"}
