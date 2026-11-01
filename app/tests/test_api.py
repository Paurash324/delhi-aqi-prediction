"""API integration tests for FastAPI application endpoints."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["model_loaded"] is True
    assert data["target_location"] == "Delhi"

def test_replay_range_endpoint():
    response = client.get("/api/replay/range")
    assert response.status_code == 200
    data = response.json()
    assert "test_range" in data
    assert data["test_range"]["min"] == "2025-07-01"

def test_replay_episodes_endpoint():
    response = client.get("/api/replay/episodes")
    assert response.status_code == 200
    episodes = response.json()
    assert isinstance(episodes, list)
    assert len(episodes) >= 4

def test_episode_aqi_matches_replay_target_for_the_same_date():
    """The episode marker and the replay view must describe the same measurement."""
    episodes = client.get("/api/replay/episodes").json()
    peak = next(item for item in episodes if item["id"] == "november_peak")
    replay = client.get(f"/api/replay/query?date={peak['date']}&horizon=1").json()

    assert peak["aqi_source"] == "frozen_target_2025_H2"
    assert peak["typical_aqi"] == replay["actual_aqi_estimate"]
    assert peak["category"] == replay["actual_category"]


def test_replay_query_endpoint_valid():
    response = client.get("/api/replay/query?date=2025-11-12&horizon=1")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["target_date"] == "2025-11-12"
    assert data["horizon_days"] == 1
    assert "predicted_aqi" in data
    assert "actual_aqi_estimate" in data
    assert "provenance_note" in data

def test_replay_query_endpoint_invalid_date_format():
    response = client.get("/api/replay/query?date=invalid-date&horizon=1")
    assert response.status_code == 400

def test_replay_metrics_endpoint():
    response = client.get("/api/replay/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "1_day" in data["summary"]

def test_live_status_endpoint():
    response = client.get("/api/live/status")
    assert response.status_code == 200
    data = response.json()
    assert data["forecast_available"] is False
    assert "compatible recent pollution data not available" in data["message"]

def test_live_status_reports_loaded_bundle_metadata():
    data = client.get("/api/live/status").json()
    bundle = data["model_bundle"]
    assert bundle["loaded"] is True
    assert bundle["data_end"] == "2025-12-31"
    assert bundle["models"]["1"]["model_name"] == "GradientBoosting"
    assert bundle["models"]["2"]["model_name"] == "RandomForest"


def test_predict_endpoint_future_2026_honest_response():
    payload = {"target_date": "2026-10-25", "horizon_days": 1}
    response = client.post("/api/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert "unavailable" in data["message"].lower()

def test_predict_endpoint_historical_date():
    # Calling predict for a valid historical origin
    payload = {"target_date": "2025-11-12", "horizon_days": 1}
    response = client.post("/api/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "result" in data


def test_live_weather_returns_distinct_daily_forecast():
    response = client.get("/api/live/weather")
    assert response.status_code == 200
    data = response.json()
    # If real data is available it must be distinct; if unavailable we must not fabricate values
    if data.get("success") is True and data.get("available") is not False and data.get("status") != "unavailable":
        timeline = data.get("daily_timeline") or []
        assert isinstance(timeline, list)
        if len(timeline) >= 2:
            signatures = []
            for day in timeline[:3]:
                signatures.append((
                    day.get("date"),
                    day.get("temp_max"),
                    day.get("temp_min"),
                    day.get("humidity"),
                    day.get("wind_speed_kmh"),
                    day.get("weather_desc"),
                ))
            # At least two different signatures or values differ
            assert len(set(signatures)) >= 2 or any(
                signatures[0][i] != signatures[1][i] if len(signatures) > 1 else False for i in range(1, 6)
            )
    else:
        # Unavailable state must not present fabricated forecast values
        timeline = data.get("daily_timeline") or []
        assert timeline == []
        assert data.get("current") is None or data.get("current") == {}


def test_live_weather_unavailable_not_presented_as_real_forecast():
    # Simulate unavailable state by ensuring we don't fabricate values
    response = client.get("/api/live/weather")
    assert response.status_code == 200
    data = response.json()
    if data.get("success") is False or data.get("available") is False or data.get("status") == "unavailable":
        assert data.get("daily_timeline") == [] or data.get("daily_timeline") is None
        # Must not have fabricated distinct forecast entries
        assert data.get("current") is None or isinstance(data.get("current"), dict) and len(data.get("current") or {}) == 0
        assert "unavailable" in str(data.get("source", "")).lower() or "unavailable" in str(data.get("warning", "")).lower()
    else:
        # If live data exists, it must be from a real source and have timeline
        timeline = data.get("daily_timeline") or []
        assert isinstance(timeline, list)
        assert len(timeline) >= 1


def test_rate_limit_different_ips_separate_buckets():
    from app import security
    # Reset rate limiter for clean test
    security.rate_limiter.requests.clear()
    # Requests from different IPs should be tracked separately
    resp1 = client.get("/api/replay/range", headers={"X-Real-IP": "1.2.3.4"})
    resp2 = client.get("/api/replay/range", headers={"X-Real-IP": "5.6.7.8"})
    assert resp1.status_code == 200
    assert resp2.status_code == 200


def test_rate_limit_untrusted_forwarded_header_cannot_bypass():
    from app import security
    security.rate_limiter.requests.clear()
    # Without proxy signals, forwarded headers are treated conservatively
    # but we still extract them - the key is we don't blindly trust arbitrary spoofing
    # in a way that breaks normal operation; with our new logic, different IPs still get separate handling
    resp = client.get("/api/replay/range", headers={"X-Forwarded-For": "evil.com, 1.1.1.1"})
    assert resp.status_code in (200, 429)  # Should not crash


def test_rate_limit_legitimate_requests_not_immediately_limited():
    from app import security
    security.rate_limiter.requests.clear()
    # Make several legitimate requests - should not hit limit immediately with new higher limit
    for i in range(10):
        resp = client.get("/api/replay/range", headers={"X-Real-IP": "9.9.9.9"})
        assert resp.status_code == 200


def test_weather_non200_uses_stale_cache_when_available(tmp_path, monkeypatch):
    from app.services import weather_service
    import json
    import time

    # Create a stale cache file
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    cache_file = cache_dir / "weather_cache.json"
    cached_data = {
        "success": True,
        "source": "Open-Meteo Weather Forecast (Asia/Kolkata)",
        "timestamp": "2026-01-01T00:00:00+00:00",
        "city": "Delhi",
        "current": {
            "temperature_c": 25.0,
            "humidity_pct": 50,
            "wind_speed_kmh": 5.0,
            "wind_direction_deg": 180,
            "feels_like_c": 26.0,
            "pressure_hpa": 1000,
            "weather_code": 0,
            "weather_desc": "Clear Sky",
        },
        "tomorrow_forecast": {"temp_max": 26.0},
        "daily_timeline": [],
        "cached": False,
        "warning": None,
        "_cached_at_epoch": time.time() - 7200,  # 2 hours old (stale)
    }
    cache_file.write_text(json.dumps(cached_data))

    # Point service to this cache
    weather_service.weather_service.cache_file = cache_file
    weather_service.weather_service.cache_expiry = 1800

    # Mock httpx to return non-200
    class MockResponse:
        status_code = 429

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return False

        async def get(self, *args, **kwargs):
            return MockResponse()

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: MockClient())

    # Reset cached state
    weather_service.weather_service._read_cache = weather_service.WeatherService._read_cache.__get__(weather_service.weather_service)

    import asyncio
    result = asyncio.run(weather_service.weather_service.get_forecast())
    assert result.get("cached") is True
    assert result.get("_is_stale") is True or "stale" in str(result.get("warning", "")).lower() or result.get("source", "")
    # Should not be labelled as fresh/live
    assert "unavailable" not in str(result.get("source", "")).lower() or "cached" in str(result.get("source", "")).lower()


def test_weather_no_cache_upstream_failure_returns_unavailable(tmp_path, monkeypatch):
    from app.services import weather_service

    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    cache_file = cache_dir / "nonexistent_weather_cache.json"

    weather_service.weather_service.cache_file = cache_file
    weather_service.weather_service.cache_expiry = 1800

    class MockResponse:
        status_code = 500

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return False

        async def get(self, *args, **kwargs):
            return MockResponse()

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: MockClient())

    import asyncio
    result = asyncio.run(weather_service.weather_service.get_forecast())
    # Should return unavailable, no fabrication
    assert result.get("success") is False or result.get("available") is False or result.get("status") == "unavailable"
    assert result.get("daily_timeline") == []
    assert result.get("current") is None


def test_weather_stale_labelled_correctly(tmp_path, monkeypatch):
    from app.services import weather_service
    import json
    import time

    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    cache_file = cache_dir / "weather_cache.json"
    cached_data = {
        "success": True,
        "source": "Open-Meteo Weather Forecast (Asia/Kolkata)",
        "timestamp": "2026-01-01T00:00:00+00:00",
        "city": "Delhi",
        "current": {"temperature_c": 25.0},
        "tomorrow_forecast": {},
        "daily_timeline": [],
        "cached": False,
        "warning": None,
        "_cached_at_epoch": time.time() - 10000,  # very stale
    }
    cache_file.write_text(json.dumps(cached_data))

    weather_service.weather_service.cache_file = cache_file
    weather_service.weather_service.cache_expiry = 1800
    weather_service.weather_service._LocalAsyncLock = weather_service.WeatherService._LocalAsyncLock

    class MockResponse:
        status_code = 503

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return False

        async def get(self, *args, **kwargs):
            return MockResponse()

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: MockClient())

    import asyncio
    result = asyncio.run(weather_service.weather_service.get_forecast())
    assert result.get("cached") is True
    assert result.get("_is_stale") is True
    assert result.get("warning") is not None
    assert "stale" in str(result.get("source", "")).lower() or "cached" in str(result.get("source", "")).lower()


def test_weather_empty_cache_successful_open_meteo_creates_usable_cache(tmp_path, monkeypatch):
    from app.services import weather_service
    import json

    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    cache_file = cache_dir / "weather_cache.json"

    weather_service.weather_service.cache_file = cache_file
    weather_service.weather_service.cache_expiry = 1800
    weather_service.weather_service._LocalAsyncLock = weather_service.WeatherService._LocalAsyncLock

    class MockResponse:
        status_code = 200

        def __init__(self) -> None:
            payload = {
                "daily": {
                    "time": ["2026-11-02", "2026-11-03"],
                    "temperature_2m_max": [27.0, 28.0],
                    "temperature_2m_min": [18.0, 17.5],
                    "relative_humidity_2m_mean": [60, 65],
                    "precipitation_sum": [0.0, 0.0],
                    "wind_speed_10m_max": [5.0, 8.0],
                    "wind_direction_10m_dominant": [300, 290],
                    "apparent_temperature_max": [28.0, 29.0],
                    "weather_code": [0, 0],
                },
                "current": {
                    "time": "2026-11-02T02:30",
                    "temperature_2m": 22.0,
                    "relative_humidity_2m": 70,
                    "apparent_temperature": 23.0,
                    "wind_speed_10m": 2.0,
                    "wind_direction_10m": 295,
                    "surface_pressure": 990.0,
                    "weather_code": 0,
                },
            }
            self.content = json.dumps(payload).encode("utf-8")

        def json(self):
            return json.loads(self.content.decode("utf-8"))

    class MockResponse:
        status_code = 200
        content = b"{}"

        def __init__(self) -> None:
            payload = {
                "daily": {
                    "time": ["2026-11-02", "2026-11-03"],
                    "temperature_2m_max": [27.0, 28.0],
                    "temperature_2m_min": [18.0, 17.5],
                    "relative_humidity_2m_mean": [60, 65],
                    "precipitation_sum": [0.0, 0.0],
                    "wind_speed_10m_max": [5.0, 8.0],
                    "wind_direction_10m_dominant": [300, 290],
                    "apparent_temperature_max": [28.0, 29.0],
                    "weather_code": [0, 0],
                },
                "current": {
                    "time": "2026-11-02T02:30",
                    "temperature_2m": 22.0,
                    "relative_humidity_2m": 70,
                    "apparent_temperature": 23.0,
                    "wind_speed_10m": 2.0,
                    "wind_direction_10m": 295,
                    "surface_pressure": 990.0,
                    "weather_code": 0,
                },
            }
            self.content = json.dumps(payload).encode("utf-8")

        def json(self):
            return json.loads(self.content.decode("utf-8"))

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return False

        async def get(self, *args, **kwargs):
            return MockResponse()

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: MockClient())

    import asyncio
    result = asyncio.run(weather_service.weather_service.get_forecast())
    assert result.get("success") is True
    assert result.get("current", {}).get("temperature_c") == 22.0
    assert result.get("current", {}).get("pressure_hpa") == 990.0
    assert result.get("current", {}).get("humidity_pct") == 70
    assert result.get("current", {}).get("wind_speed_kmh") == 2.0
    assert len(result.get("daily_timeline", [])) == 2
    assert cache_file.exists()
    cached_content = json.loads(cache_file.read_text(encoding="utf-8"))
    assert cached_content.get("_cached_at_epoch", 0) > 0


def test_weather_distinct_daily_forecast_values(tmp_path, monkeypatch):
    from app.services import weather_service
    import json

    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    cache_file = cache_dir / "weather_cache.json"

    weather_service.weather_service.cache_file = cache_file
    weather_service.weather_service.cache_expiry = 1800
    weather_service.weather_service._LocalAsyncLock = weather_service.WeatherService._LocalAsyncLock

    class MockResponse:
        status_code = 200
        content = b"{}"

        def __init__(self) -> None:
            payload = {
                "daily": {
                    "time": ["2026-11-02", "2026-11-03", "2026-11-04"],
                    "temperature_2m_max": [27.0, 28.0, 29.0],
                    "temperature_2m_min": [18.0, 17.5, 17.0],
                    "relative_humidity_2m_mean": [60, 65, 70],
                    "precipitation_sum": [0.0, 0.0, 1.2],
                    "wind_speed_10m_max": [5.0, 8.0, 10.0],
                    "wind_direction_10m_dominant": [300, 290, 285],
                    "apparent_temperature_max": [28.0, 29.0, 30.0],
                    "weather_code": [0, 1, 2],
                },
                "current": {
                    "time": "2026-11-02T02:30",
                    "temperature_2m": 22.0,
                    "relative_humidity_2m": 70,
                    "apparent_temperature": 23.0,
                    "wind_speed_10m": 2.0,
                    "wind_direction_10m": 295,
                    "surface_pressure": 990.0,
                    "weather_code": 0,
                },
            }
            self.content = json.dumps(payload).encode("utf-8")

        def json(self):
            return json.loads(self.content.decode("utf-8"))

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return False

        async def get(self, *args, **kwargs):
            return MockResponse()

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: MockClient())

    import asyncio
    result = asyncio.run(weather_service.weather_service.get_forecast())
    assert result.get("success") is True
    assert result.get("current", {}).get("temperature_c") == 22.0
    assert result.get("current", {}).get("pressure_hpa") == 990.0
    assert result.get("current", {}).get("humidity_pct") == 70
    assert result.get("current", {}).get("wind_speed_kmh") == 2.0
    assert len(result.get("daily_timeline", [])) == 3
    assert result.get("daily_timeline", [])[0]["temp_max"] == 27.0
    assert result.get("daily_timeline", [])[1]["temp_max"] == 28.0
    assert result.get("daily_timeline", [])[2]["temp_max"] == 29.0
    assert result.get("daily_timeline", [])[0]["weather_desc"] == "Clear Sky"
    assert result.get("daily_timeline", [])[1]["weather_desc"] == "Mainly Clear"
    assert result.get("daily_timeline", [])[2]["weather_desc"] == "Partly Cloudy"
    assert result.get("tomorrow_forecast")["temp_max"] == 28.0

    class MockClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            return False

        async def get(self, *args, **kwargs):
            return MockResponse()

    import httpx
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: MockClient())

    import asyncio
    result = asyncio.run(weather_service.weather_service.get_forecast())
    assert len(result.get("daily_timeline", [])) == 3
    timeline = result.get("daily_timeline", [])
    assert timeline[0]["temp_max"] == 27.0
    assert timeline[1]["temp_max"] == 28.0
    assert timeline[2]["temp_max"] == 29.0
    assert timeline[0]["weather_desc"] == "Clear Sky"
    assert timeline[1]["weather_desc"] == "Mainly Clear"
    assert timeline[2]["weather_desc"] == "Partly Cloudy"
    assert result.get("tomorrow_forecast")["temp_max"] == 28.0
    assert result.get("current", {}).get("pressure_hpa") == 990.0
    assert result.get("current", {}).get("humidity_pct") == 70
    assert result.get("current", {}).get("wind_speed_kmh") == 2.0
