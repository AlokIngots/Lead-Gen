"""Global per-IP rate limiting middleware for FastAPI.

Uses an in-memory sliding window counter. For multi-instance deployments,
replace with Redis-backed counters.
"""
import os
import time
from collections import defaultdict, deque

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Configurable via env
RATE_LIMIT_RPM = int(os.getenv("RATE_LIMIT_RPM", "120"))  # requests per minute
RATE_LIMIT_BURST = int(os.getenv("RATE_LIMIT_BURST", "30"))  # max burst in 5s window

# Paths exempt from rate limiting
EXEMPT_PATHS = {"/", "/health"}


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, rpm: int = RATE_LIMIT_RPM, burst: int = RATE_LIMIT_BURST):
        super().__init__(app)
        self.rpm = rpm
        self.burst = burst
        self._minute_windows: dict[str, deque] = defaultdict(deque)
        self._burst_windows: dict[str, deque] = defaultdict(deque)

    def _client_ip(self, request: Request) -> str:
        # Prefer X-Forwarded-For (behind nginx) then fall back to client host
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _check(self, key: str, now: float) -> bool:
        # Per-minute window
        mq = self._minute_windows[key]
        while mq and (now - mq[0]) > 60:
            mq.popleft()
        if len(mq) >= self.rpm:
            return False

        # Per-5s burst window
        bq = self._burst_windows[key]
        while bq and (now - bq[0]) > 5:
            bq.popleft()
        if len(bq) >= self.burst:
            return False

        mq.append(now)
        bq.append(now)
        return True

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        ip = self._client_ip(request)
        now = time.time()

        if not self._check(ip, now):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
            )

        response = await call_next(request)

        # Add rate limit headers for transparency
        mq = self._minute_windows[ip]
        remaining = max(0, self.rpm - len(mq))
        response.headers["X-RateLimit-Limit"] = str(self.rpm)
        response.headers["X-RateLimit-Remaining"] = str(remaining)

        return response
