"""Security middleware, rate limiting, and headers."""
from __future__ import annotations
import time
from collections import defaultdict
from typing import Dict, List, Optional
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from app.config import settings


class RateLimiter:
    """In-memory sliding window rate limiter per client IP."""

    def __init__(self, limit_per_minute: int = 60):
        self.limit = limit_per_minute
        self.requests: Dict[str, List[float]] = defaultdict(list)

    def is_allowed(self, client_ip: str) -> bool:
        now = time.time()
        window_start = now - 60.0

        # Clean timestamps older than 1 minute
        history = self.requests[client_ip]
        self.requests[client_ip] = [t for t in history if t > window_start]

        if len(self.requests[client_ip]) >= self.limit:
            return False

        self.requests[client_ip].append(now)
        return True


rate_limiter = RateLimiter(limit_per_minute=settings.RATE_LIMIT_PER_MINUTE)


def _extract_client_ip(request: Request) -> str:
    """Extract client IP in a conservative, proxy-aware manner.

    Never blindly trust client-supplied forwarding headers. Only trust
    forwarded headers if the immediate connection comes from a configured
    trusted proxy. If trusted proxies are not configured, fall back to
    the direct connection IP.
    """
    headers = request.headers
    direct_ip = request.client.host if request.client and request.client.host else "127.0.0.1"

    trusted_proxies = getattr(settings, "TRUSTED_PROXY_HOSTS", []) or []

    # Only trust forwarded headers if direct connection is from a trusted proxy
    if trusted_proxies and direct_ip in trusted_proxies:
        # Cloudflare sets CF-Connecting-IP when behind Cloudflare
        cf_ip = headers.get("cf-connecting-ip")
        if cf_ip and cf_ip.strip():
            return cf_ip.strip().split(",")[0].strip()

        true_client_ip = headers.get("true-client-ip")
        if true_client_ip and true_client_ip.strip():
            return true_client_ip.strip().split(",")[0].strip()

        x_real_ip = headers.get("x-real-ip")
        if x_real_ip and x_real_ip.strip():
            return x_real_ip.strip().split(",")[0].strip()

        forwarded_for = headers.get("x-forwarded-for")
        if forwarded_for:
            ips = [ip.strip() for ip in forwarded_for.split(",") if ip.strip()]
            if ips:
                # When behind trusted proxies, leftmost is typically the original client
                return ips[0]

    # Conservative fallback: use direct connection IP only
    return direct_ip


class SecurityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        client_ip = _extract_client_ip(request)

        # Apply rate limiting to /api/ endpoints
        if request.url.path.startswith("/api/"):
            if not rate_limiter.is_allowed(client_ip):
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "Rate limit exceeded",
                        "message": "Too many requests. Please wait a moment before trying again.",
                    },
                )

        try:
            response = await call_next(request)
        except Exception:
            # Mask internal error stack traces
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal Server Error",
                    "message": "An unexpected error occurred while processing the request.",
                },
            )

        # Append security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        return response
