"""Tests for Demo Simulation mode and its separation from live/model data.

Every upstream payload here is stubbed: no network access and no data.gov.in
credential are required. The demo fixture itself performs no I/O.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any, Dict, List

import httpx
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.demo_simulation_service import (
    DEMO_NOTICE,
    DEMO_STATION_NAMES,
    POLLUTANTS,
    SimulatedInputError,
    contains_simulated_records,
    demo_records,
    demo_simulation_service,
)
from app.services.live_observations_service import IST, live_observations_service
from app.services.prediction_service import prediction_service

TEST_KEY = "test-only-key-not-real"
client = TestClient(app)

REAL_CPCB_STATION_NAMES = (
    "Anand Vihar, Delhi - DPCC",
    "Lodhi Road, Delhi - IITM",
    "Mandir Marg, Delhi - DPCC",
    "Nehru Nagar, Delhi - DPCC",
    "Punjabi Bagh, Delhi - DPCC",
    "ITO, Delhi - CPCB",
)


# --------------------------------------------------------------------------- helpers
def _stamp(hours_ago: float = 1.0) -> str:
    return (datetime.now(IST) - timedelta(hours=hours_ago)).strftime("%d-%m-%Y %H:%M:%S")


def _live_payload(station: str, pollutant: str, avg: str) -> Dict[str, Any]:
    return {
        "updated_date": "2026-10-29T19:02:24Z",
        "total": 1,
        "records": [
            {
                "station": station,
                "last_update": _stamp(),
                "pollutant_id": pollutant,
                "min_value": avg,
                "max_value": avg,
                "avg_value": avg,
            }
        ],
    }


def _reset_live_cache() -> None:
    live_observations_service._cache = None
    live_observations_service._cache_epoch = 0.0


def _collect_station_names(payload: Any) -> List[str]:
    stations = payload.get("stations") or []
    return [str(item.get("station")) for item in stations if isinstance(item, dict)]


# --------------------------------------------------------------------- demo payload
def test_demo_endpoint_returns_labelled_simulated_records():
    response = client.get("/api/demo/observations")

    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "DEMO"
    assert data["kind"] == "simulated_demo_observations"
    assert data["is_simulated"] is True
    assert data["is_aqi"] is False
    assert data["is_trained_model_output"] is False
    assert data["aqi"] is None
    assert data["notice"] == DEMO_NOTICE
    assert "SIMULATED DEMO DATA" in data["notice"]
    assert "NOT LIVE" in data["notice"]
    assert "NOT OFFICIAL CPCB AQI" in data["notice"]
    assert "fabricated" in data["disclaimer"].lower()
    assert "fabricated sample records" in data["demo_note"]


def test_demo_endpoint_has_six_to_eight_fictitious_stations():
    data = client.get("/api/demo/observations").json()

    assert 6 <= data["station_count"] <= 8
    assert data["station_count"] == len(data["stations"])
    assert {station["station"] for station in data["stations"]} == set(DEMO_STATION_NAMES)
    assert all(name.startswith("Demo ") for name in DEMO_STATION_NAMES)

    record_count = sum(len(station["readings"]) for station in data["stations"])
    assert data["record_count"] == record_count
    assert record_count > 0


def test_demo_records_carry_no_aqi_and_no_model_output():
    data = client.get("/api/demo/observations").json()

    for station in data["stations"]:
        assert station["aqi"] is None
        assert station["is_aqi"] is False
        assert station["is_trained_model_output"] is False
        assert station["is_simulated"] is True
        assert station["readings"], "every demo station needs sample readings"
        for reading in station["readings"]:
            assert reading["aqi"] is None
            assert reading["is_aqi"] is False
            assert reading["is_trained_model_output"] is False
            assert reading["unit_status"] == "illustrative_only"
            assert isinstance(reading["value"], (int, float))

    # No AQI, category or official claim anywhere in the simulated payload.
    assert "category" not in data
    assert "aqi_note" in data
    assert "No AQI is calculated" in data["aqi_note"]


def test_demo_pollutants_cover_required_set_with_illustrative_units():
    data = client.get("/api/demo/observations").json()
    expected = {"PM2.5", "PM10", "NO2", "SO2", "CO", "O3", "NH3"}

    assert {pollutant for pollutant, _ in POLLUTANTS} == expected
    assert {item["pollutant"] for item in data["pollutants"]} == expected

    for station in data["stations"]:
        assert {reading["pollutant"] for reading in station["readings"]} == expected

    for reading in data["stations"][0]["readings"]:
        assert reading["unit"] in {"µg/m³", "mg/m³"}
    assert "illustrative" in data["unit_notice"].lower()


def test_demo_payload_is_deterministic():
    first = client.get("/api/demo/observations").json()
    second = client.get("/api/demo/observations").json()

    assert first == second
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
    assert demo_simulation_service.build_payload() == demo_simulation_service.build_payload()


def test_demo_timestamps_are_marked_illustrative():
    data = client.get("/api/demo/observations").json()
    snapshot = data["sample_snapshot"]

    assert snapshot["is_illustrative"] is True
    assert "not the current time" in snapshot["note"]
    assert snapshot["label"]

    for station in data["stations"]:
        assert station["illustrative_timestamp_label"].endswith("IST")
        assert station["illustrative_timestamp"]


def test_demo_stations_do_not_reuse_real_cpcb_names():
    data = client.get("/api/demo/observations").json()
    payload_text = json.dumps(data)

    for real_name in REAL_CPCB_STATION_NAMES:
        short = real_name.split(",")[0]
        assert short not in payload_text, f"real station name leaked into demo data: {real_name}"


# ------------------------------------------------------------------- live isolation
def test_live_endpoint_never_returns_simulated_records(monkeypatch):
    monkeypatch.delenv("DATA_GOV_IN_API_KEY", raising=False)
    _reset_live_cache()

    response = client.get("/api/live/observations")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "UNAVAILABLE"
    assert data["stations"] == []
    assert data["station_count"] == 0
    assert data["kind"] == "official_station_observations"
    assert "is_simulated" not in data
    assert not (set(_collect_station_names(data)) & set(DEMO_STATION_NAMES))
    assert DEMO_NOTICE not in json.dumps(data)


def test_live_endpoint_error_state_is_not_disguised_as_demo(monkeypatch):
    monkeypatch.setenv("DATA_GOV_IN_API_KEY", TEST_KEY)
    _reset_live_cache()

    async def failing_fetch(self):
        raise httpx.ReadTimeout("timed out")

    monkeypatch.setattr(
        live_observations_service,
        "_fetch_records",
        failing_fetch.__get__(live_observations_service, type(live_observations_service)),
    )

    data = client.get("/api/live/observations").json()

    assert data["status"] == "ERROR"
    assert data["stations"] == []
    assert data["aqi"] is None
    assert not (set(_collect_station_names(data)) & set(DEMO_STATION_NAMES))
    assert "simulated" not in json.dumps(data).lower()


def test_live_ok_payload_contains_only_reported_stations(monkeypatch):
    monkeypatch.setenv("DATA_GOV_IN_API_KEY", TEST_KEY)
    _reset_live_cache()

    async def fetch(self):
        return _live_payload("Lodhi Road, Delhi - IITM", "PM2.5", "117")

    monkeypatch.setattr(
        live_observations_service,
        "_fetch_records",
        fetch.__get__(live_observations_service, type(live_observations_service)),
    )

    data = client.get("/api/live/observations").json()

    assert data["status"] == "OK"
    assert _collect_station_names(data) == ["Lodhi Road, Delhi - IITM"]
    assert not (set(_collect_station_names(data)) & set(DEMO_STATION_NAMES))
    assert data["kind"] == "official_station_observations"


def test_switching_modes_does_not_leak_data_between_endpoints(monkeypatch):
    monkeypatch.delenv("DATA_GOV_IN_API_KEY", raising=False)
    _reset_live_cache()

    # Switch to Demo Simulation first.
    demo = client.get("/api/demo/observations").json()
    assert demo["status"] == "DEMO"
    # The demo endpoint must not populate the live service cache.
    assert live_observations_service._cache is None

    # Switching back to Live Data still reports its real unavailable state.
    live = client.get("/api/live/observations").json()
    assert live["status"] == "UNAVAILABLE"
    assert live["stations"] == []
    assert live["aqi"] is None

    # Switching to demo again returns the same simulated snapshot, not live data.
    demo_again = client.get("/api/demo/observations").json()
    assert demo_again == demo
    assert set(_collect_station_names(demo_again)) == set(DEMO_STATION_NAMES)


def test_demo_endpoint_works_without_live_credentials(monkeypatch):
    monkeypatch.delenv("DATA_GOV_IN_API_KEY", raising=False)

    response = client.get("/api/demo/observations")

    assert response.status_code == 200
    assert response.json()["is_simulated"] is True
    assert response.json()["station_count"] >= 6


# ------------------------------------------------------------------- model guard
def test_prediction_service_rejects_demo_records():
    rows = demo_records()
    assert rows, "demo records must exist for this guard test"

    with pytest.raises(SimulatedInputError) as excinfo:
        prediction_service.predict(pd.DataFrame(rows), 1)

    assert "Simulated demo records cannot be used for prediction" in str(excinfo.value)


def test_prediction_endpoint_rejects_simulated_custom_history():
    payload = {
        "target_date": "2025-11-12",
        "horizon_days": 1,
        "custom_history": [
            {"date": "2025-11-12", "aqi": 250.0, "station": "Demo North", "is_simulated": True}
        ],
    }

    response = client.post("/api/predict", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert data["status"] == "REJECTED"
    assert "simulated" in data["message"].lower()
    assert "result" not in data


def test_prediction_endpoint_rejects_demo_payload_reused_as_history():
    demo = client.get("/api/demo/observations").json()
    readings = demo["stations"][0]["readings"][:7]
    history = [
        {
            "date": f"2025-11-{index + 1:02d}",
            "aqi": reading["value"],
            "pollutant": reading["pollutant"],
            "source": demo["kind"],
        }
        for index, reading in enumerate(readings)
    ]

    response = client.post(
        "/api/predict",
        json={"target_date": "2025-11-12", "horizon_days": 1, "custom_history": history},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "REJECTED"


def test_guard_does_not_flag_legitimate_history_rows():
    legitimate = pd.DataFrame(
        [
            {"date": "2025-11-05", "aqi": 210.0, "pm25": 90.0},
            {"date": "2025-11-06", "aqi": 198.0, "pm25": 84.0},
        ]
    )

    assert contains_simulated_records(legitimate) is False
    assert contains_simulated_records([{"date": "2025-11-05", "aqi": 210.0}]) is False
    assert contains_simulated_records(None) is False


def test_guard_flags_full_demo_payload_and_flat_rows():
    demo = client.get("/api/demo/observations").json()

    assert contains_simulated_records(demo) is True
    assert contains_simulated_records(demo["stations"]) is True
    assert contains_simulated_records(demo_records()) is True
    assert contains_simulated_records(pd.DataFrame(demo_records())) is True


def test_guard_reads_boolean_flag_column_and_ignores_nan():
    flagged = pd.DataFrame(
        [
            {"date": "2025-11-05", "is_simulated": True},
            {"date": "2025-11-06", "is_simulated": False},
        ]
    )
    clean_with_nan = pd.DataFrame([{"date": "2025-11-05", "is_simulated": float("nan")}])

    assert contains_simulated_records(flagged) is True
    assert contains_simulated_records(clean_with_nan) is False
