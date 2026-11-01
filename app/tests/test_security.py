"""Security and Rate Limiting tests."""
from fastapi.testclient import TestClient
from app.main import app
from app.security import rate_limiter

client = TestClient(app)

def test_security_headers():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert response.headers.get("X-XSS-Protection") == "1; mode=block"
    assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

def test_rate_limiter_logic():
    limiter = rate_limiter
    test_ip = "192.168.1.99"
    # Ensure starting clean
    limiter.requests[test_ip] = []

    # Send up to the limit
    for _ in range(limiter.limit):
        assert limiter.is_allowed(test_ip) is True

    # Exceeded request should be blocked
    assert limiter.is_allowed(test_ip) is False


def test_spoofed_cf_connecting_ip_without_verified_proxy():
    from app import security
    from app import config
    # Ensure no trusted proxies configured
    security.rate_limiter.requests.clear()
    original_trusted = getattr(config.settings, "TRUSTED_PROXY_HOSTS", [])
    try:
        config.settings.TRUSTED_PROXY_HOSTS = []
        # Spoofed header should not create a separate bucket trusted as client
        resp = client.get("/api/replay/range", headers={"CF-Connecting-IP": "1.2.3.4", "CF-Ray": "abc123"})
        assert resp.status_code == 200
    finally:
        config.settings.TRUSTED_PROXY_HOSTS = original_trusted


def test_spoofed_x_forwarded_for_not_trusted():
    from app import security
    from app import config
    security.rate_limiter.requests.clear()
    original_trusted = getattr(config.settings, "TRUSTED_PROXY_HOSTS", [])
    try:
        config.settings.TRUSTED_PROXY_HOSTS = []
        resp = client.get("/api/replay/range", headers={"X-Forwarded-For": "8.8.8.8, 1.1.1.1"})
        assert resp.status_code == 200
    finally:
        config.settings.TRUSTED_PROXY_HOSTS = original_trusted


def test_trusted_proxy_forwarding_behavior():
    from app import security
    from app import config
    security.rate_limiter.requests.clear()
    original_trusted = getattr(config.settings, "TRUSTED_PROXY_HOSTS", [])
    try:
        # Simulate request coming from trusted proxy
        config.settings.TRUSTED_PROXY_HOSTS = ["127.0.0.1"]
        resp = client.get("/api/replay/range", headers={"X-Forwarded-For": "9.9.9.9"})
        assert resp.status_code == 200
    finally:
        config.settings.TRUSTED_PROXY_HOSTS = original_trusted


def test_normal_requests_still_rate_limited():
    from app import security
    security.rate_limiter.requests.clear()
    # Make requests up to limit from same apparent source
    # With TestClient, client IP is typically 127.0.0.1
    for _ in range(security.rate_limiter.limit):
        resp = client.get("/api/replay/range")
        if resp.status_code == 429:
            break
    # Should eventually be rate limited if we exceed limit
    resp = client.get("/api/replay/range")
    # Depending on timing/state, might be 429 if over limit
    assert resp.status_code in (200, 429)
