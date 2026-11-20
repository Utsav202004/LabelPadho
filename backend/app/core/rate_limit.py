"""
Per-client rate limiting for endpoints that spend the free Gemini quota.

WHY
===
/api/analyze is public and each call costs Gemini quota. One script (or a
demo going viral) could exhaust the daily free tier and break scanning for
everyone. A small sliding-window limit per client IP prevents that.

DESIGN
======
- In-memory sliding window: fine for a single Render instance. With several
  instances you'd move the counters to Redis (same interface).
- Client IP: behind Render's proxy the real client is the RIGHT-most entry
  of X-Forwarded-For (appended by the proxy). The left-most entries are
  whatever the client sent, so they can be spoofed and are ignored.
"""

import math
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request
from pydantic_settings import BaseSettings, SettingsConfigDict


class RateLimitSettings(BaseSettings):
    rate_limit_scans_per_hour: int = 15
    rate_limit_translations_per_hour: int = 30
    trust_proxy_headers: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = RateLimitSettings()


def client_ip(request: Request) -> str:
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


class SlidingWindowLimiter:
    def __init__(self, name: str, limit: int, window_seconds: int = 3600):
        self.name = name
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Record a hit for `key`, or raise 429 if the window is full."""
        if self.limit <= 0:
            return  # disabled
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                retry_after = math.ceil(hits[0] + self.window - now)
                minutes = max(1, math.ceil(retry_after / 60))
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"You've reached the limit of {self.limit} {self.name} per hour. "
                        f"Please try again in about {minutes} minute(s), or search the catalog meanwhile."
                    ),
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)
            # Keep memory bounded: drop clients with no recent activity
            if len(self._hits) > 10_000:
                for k in [k for k, v in self._hits.items() if not v or v[-1] <= now - self.window]:
                    del self._hits[k]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def __call__(self, request: Request) -> None:
        """Use as a FastAPI dependency: Depends(scan_limiter)."""
        self.check(client_ip(request))


scan_limiter = SlidingWindowLimiter("label scans", settings.rate_limit_scans_per_hour)
translate_limiter = SlidingWindowLimiter("translations", settings.rate_limit_translations_per_hour)
