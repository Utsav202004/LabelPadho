"""Admin key for maintenance endpoints (review queue, seeding, deletes). Disabled when unset."""

import secrets

from fastapi import Header, HTTPException
from pydantic_settings import BaseSettings, SettingsConfigDict


class AdminSettings(BaseSettings):
    admin_key: str | None = None
    reports_admin_key: str | None = None  # older name, still accepted

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


def configured_admin_key() -> str | None:
    s = AdminSettings()
    return s.admin_key or s.reports_admin_key


def is_admin(provided: str | None) -> bool:
    key = configured_admin_key()
    return bool(key and provided and secrets.compare_digest(key, provided))


def require_admin(x_admin_key: str | None = Header(None)) -> None:
    """FastAPI dependency: 404 when no admin key is configured (endpoint hidden), 401 when wrong."""
    if not configured_admin_key():
        raise HTTPException(status_code=404, detail="Not found")
    if not is_admin(x_admin_key):
        raise HTTPException(status_code=401, detail="Admin key required")
