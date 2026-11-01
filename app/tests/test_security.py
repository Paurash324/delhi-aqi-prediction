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
