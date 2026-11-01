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
