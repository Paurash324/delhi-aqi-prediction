"""Tests for the data.gov.in live station-observations service.

All payloads are synthetic and every HTTP call is stubbed: no network access and
no data.gov.in key are required to run these tests.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.live_observations_service import (
    IST,
    LiveObservationsService,
    ObservationsUpstreamError,
    live_observations_service,
)

TEST_KEY = "test-only-key-not-real"
client = TestClient(app)


# --------------------------------------------------------------------------- helpers
def _stamp(hours_ago: float = 1.0) -> str:
    return (datetime.now(IST) - timedelta(hours=hours_ago)).strftime("%d-%m-%Y %H:%M:%S")


def _record(
    station: str,
    pollutant: str,
    avg: Any,
    *,
    minimum: Any = None,
    maximum: Any = None,
    last_update: str | None = None,
) -> Dict[str, Any]:
    return {
        "country": "India",
        "state": "Delhi",
        "city": "Delhi",
        "station": station,
        "last_update": last_update if last_update is not None else _stamp(),
        "latitude": "28.636429",
        "longitude": "77.201067",
        "pollutant_id": pollutant,
        "min_value": minimum if minimum is not None else avg,
        "max_value": maximum if maximum is not None else avg,
        "avg_value": avg,
    }


def _payload(records: List[Any], total: int | None = None) -> Dict[str, Any]:
    return {
        "index_name": "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69",
        "title": "Real time Air Quality Index from various locations",
        "updated_date": "2026-10-29T19:02:24Z",
        "total": len(records) if total is None else total,
        "count": len(records),
        "records": records,
    }


def _service(monkeypatch: pytest.MonkeyPatch) -> LiveObservationsService:
    monkeypatch.setenv("DATA_GOV_IN_API_KEY", TEST_KEY)
    return LiveObservationsService()


def _install(monkeypatch: pytest.MonkeyPatch, service: LiveObservationsService, payload: Any) -> List[int]:
    calls = [0]

    async def fetch(self):
        calls[0] += 1
        if isinstance(payload, Exception):
            raise payload
        return payload

    monkeypatch.setattr(service, "_fetch_records", fetch.__get__(service, type(service)))
    return calls


# ----------------------------------------------------------------------- valid data
def test_valid_records_return_raw_observations(monkeypatch):
    service = _service(monkeypatch)
    payload = _payload(
        [
            _record("Mandir Marg, Delhi - DPCC", "PM2.5", "15", minimum="10", maximum="20"),
            _record("Mandir Marg, Delhi - DPCC", "NH3", "8"),
            _record("Nehru Nagar, Delhi - DPCC", "CO", "30", minimum="24", maximum="35"),
        ]
    )
    _install(monkeypatch, service, payload)

    result = asyncio.run(service.get_observations())

    assert result["status"] == "OK"
    assert result["kind"] == "official_station_observations"
    assert result["is_trained_model_output"] is False
    assert result["is_aqi"] is False
    assert result["station_count"] == 2
    assert result["record_count"] == 3
    assert result["skipped_records"] == 0
    assert {item["pollutant"] for item in result["pollutants"]} == {"PM2.5", "NH3", "CO"}
    assert {station["station"] for station in result["stations"]} == {
        "Mandir Marg, Delhi - DPCC",
        "Nehru Nagar, Delhi - DPCC",
    }

    station = next(s for s in result["stations"] if s["station"] == "Mandir Marg, Delhi - DPCC")
    pm25 = next(p for p in station["pollutants"] if p["pollutant"] == "PM2.5")
    assert pm25["reported_avg"] == 15.0
    assert pm25["reported_min"] == 10.0
    assert pm25["reported_max"] == 20.0


def test_observation_timestamp_and_freshness_are_reported(monkeypatch):
    service = _service(monkeypatch)
    payload = _payload([_record("Lodhi Road", "PM10", "117", last_update=_stamp(hours_ago=1))])
    _install(monkeypatch, service, payload)

    result = asyncio.run(service.get_observations())

    block = result["observation_timestamp"]
    assert block["latest_raw"]
    assert block["parsed_ist"].endswith("+05:30")
    assert "no UTC offset" in block["timezone_assumption"]
    assert result["freshness"]["status"] == "fresh"
    assert 0 <= result["freshness"]["age_hours"] < 2


def test_old_timestamp_is_marked_stale(monkeypatch):
    service = _service(monkeypatch)
    payload = _payload([_record("Lodhi Road", "PM10", "117", last_update=_stamp(hours_ago=72))])
    _install(monkeypatch, service, payload)

    result = asyncio.run(service.get_observations())

    assert result["status"] == "OK"
    assert result["freshness"]["status"] == "stale"
    assert result["freshness"]["age_hours"] >= 72
    assert "older than the freshness threshold" in result["freshness"]["note"]


def test_unparseable_timestamp_yields_unknown_freshness(monkeypatch):
    service = _service(monkeypatch)
    payload = _payload([_record("Lodhi Road", "PM10", "117", last_update="yesterday")])
    _install(monkeypatch, service, payload)

    result = asyncio.run(service.get_observations())

    assert result["status"] == "OK"
    assert result["observation_timestamp"]["latest_raw"] == "yesterday"
    assert result["observation_timestamp"]["parsed_ist"] is None
    assert result["freshness"]["status"] == "unknown"


# ------------------------------------------------------------------------- units
def test_units_are_flagged_unverified_everywhere(monkeypatch):
    service = _service(monkeypatch)
    payload = _payload([_record("Anand Vihar", "PM2.5", "180"), _record("Anand Vihar", "CO", "78")])
    _install(monkeypatch, service, payload)

    result = asyncio.run(service.get_observations())

    assert result["units"]["status"] == "unverified"
    assert result["units"]["unit"] is None
    assert "no unit or averaging-window field" in result["units"]["note"]

    for pollutant in result["pollutants"]:
        assert pollutant["unit_status"] == "unverified"
        assert pollutant["unit"] is None
    for station in result["stations"]:
        for row in station["pollutants"]:
            assert row["unit_status"] == "unverified"
            assert row["unit"] is None

    # No AQI is produced from unverified units.
    assert result["aqi"] is None
    assert "No AQI is computed from this source" in result["aqi_note"]


def test_not_reported_values_stay_null(monkeypatch):
    service = _service(monkeypatch)
    payload = _payload(
        [_record("Lodhi Road", "NH3", "NA", minimum="NA", maximum="NA"),
         _record("Lodhi Road", "PM2.5", "42")]
    )
    _install(monkeypatch, service, payload)

    result = asyncio.run(service.get_observations())

    station = result["stations"][0]
    nh3 = next(row for row in station["pollutants"] if row["pollutant"] == "NH3")
    assert nh3["reported_avg"] is None
    assert nh3["reported_min"] is None
    assert nh3["reported_max"] is None

    summary = next(item for item in result["pollutants"] if item["pollutant"] == "NH3")
    assert summary["stations_reporting"] == 0
    assert result["aqi"] is None


# ----------------------------------------------------------------- credentials
def test_missing_api_key_returns_unavailable_without_fetching(monkeypatch):
    monkeypatch.delenv("DATA_GOV_IN_API_KEY", raising=False)
    service = LiveObservationsService()
    calls = _install(monkeypatch, service, _payload([_record("Lodhi Road", "PM2.5", "42")]))

    result = asyncio.run(service.get_observations())

    assert calls == [0], "no request may be sent without a credential"
    assert result["status"] == "UNAVAILABLE"
    assert result["missing_credential"] is True
    assert "DATA_GOV_IN_API_KEY" in result["message"] + result["setup"]
    assert result["stations"] == []
    assert result["aqi"] is None


# --------------------------------------------------------------- upstream errors
def test_upstream_timeout_returns_error(monkeypatch):
    import httpx

    service = _service(monkeypatch)
    _install(monkeypatch, service, httpx.ReadTimeout("timed out"))

    result = asyncio.run(service.get_observations())

    assert result["status"] == "ERROR"
    assert result["stations"] == []
    assert result["aqi"] is None
    assert "could not be retrieved" in result["message"]
    assert any("timed out" in reason for reason in result["reasons"])


def test_upstream_http_error_redacts_the_key(monkeypatch):
    service = _service(monkeypatch)
    _install(
        monkeypatch,
        service,
        ObservationsUpstreamError(f"data.gov.in returned HTTP 500 for api-key={TEST_KEY}"),
    )

    result = asyncio.run(service.get_observations())
    serialised = json.dumps(result)

    assert result["status"] == "ERROR"
    assert "HTTP 500" in serialised
    assert TEST_KEY not in serialised
    assert "***" in serialised


def test_response_never_contains_the_key(monkeypatch):
    service = _service(monkeypatch)
    payload = _payload([_record("Lodhi Road", "PM2.5", "42")])
    _install(monkeypatch, service, payload)

    result = asyncio.run(service.get_observations())

    assert TEST_KEY not in json.dumps(result)


# ------------------------------------------------------------ malformed payloads
@pytest.mark.parametrize(
    "payload",
    [
        {"records": "not-a-list"},
        {"records": None},
        {"total": 4},
        [],
        "not-an-object",
    ],
)
def test_malformed_payload_returns_unavailable(monkeypatch, payload):
    service = _service(monkeypatch)
    _install(monkeypatch, service, payload)

    result = asyncio.run(service.get_observations())

    assert result["status"] == "UNAVAILABLE"
    assert result["stations"] == []
    assert result["aqi"] is None
    assert result["message"]


def test_structurally_invalid_records_are_skipped(monkeypatch):
    service = _service(monkeypatch)
    payload = _payload(
        [
            _record("Lodhi Road", "PM2.5", "42"),
            {"station": "", "pollutant_id": "PM10", "avg_value": "10"},
            {"station": "Somewhere", "avg_value": "10"},
            "not-a-record",
        ]
    )
    _install(monkeypatch, service, payload)

    result = asyncio.run(service.get_observations())

    assert result["status"] == "OK"
    assert result["station_count"] == 1
    assert result["record_count"] == 1
    assert result["skipped_records"] == 3


def test_payload_with_no_usable_records_is_unavailable(monkeypatch):
    service = _service(monkeypatch)
    _install(monkeypatch, service, _payload([{"station": "", "pollutant_id": ""}]))

    result = asyncio.run(service.get_observations())

    assert result["status"] == "UNAVAILABLE"
    assert result["station_count"] == 0
    assert "No usable Delhi station records" in result["message"]


# ------------------------------------------------------------------------- cache
def test_cache_is_reused_within_ttl(monkeypatch):
    service = _service(monkeypatch)
    calls = _install(monkeypatch, service, _payload([_record("Lodhi Road", "PM2.5", "42")]))

    first = asyncio.run(service.get_observations())
    second = asyncio.run(service.get_observations())

    assert calls == [1]
    assert first["cached"] is False
    assert second["cached"] is True
    assert second["station_count"] == first["station_count"]


def test_truncated_payload_is_flagged(monkeypatch):
    service = _service(monkeypatch)
    payload = _payload([_record("Lodhi Road", "PM2.5", "42")], total=413)
    _install(monkeypatch, service, payload)

    result = asyncio.run(service.get_observations())

    assert result["status"] == "OK"
    assert result["truncated"] is True
    assert result["source_total"] == 413
    assert any("413" in reason for reason in result["reasons"])


# ---------------------------------------------------------------------- endpoint
def test_observations_endpoint_returns_payload(monkeypatch):
    monkeypatch.setenv("DATA_GOV_IN_API_KEY", TEST_KEY)
    live_observations_service._cache = None
    live_observations_service._cache_epoch = 0.0

    async def fetch(self):
        return _payload(
            [_record("Mandir Marg, Delhi - DPCC", "PM2.5", "15")], total=1
        )

    monkeypatch.setattr(
        live_observations_service,
        "_fetch_records",
        fetch.__get__(live_observations_service, type(live_observations_service)),
    )

    response = client.get("/api/live/observations")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "OK"
    assert data["station_count"] == 1
    assert data["is_trained_model_output"] is False
    assert data["aqi"] is None
    assert data["units"]["status"] == "unverified"


def test_observations_endpoint_reports_missing_key(monkeypatch):
    monkeypatch.delenv("DATA_GOV_IN_API_KEY", raising=False)
    live_observations_service._cache = None
    live_observations_service._cache_epoch = 0.0

    response = client.get("/api/live/observations")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "UNAVAILABLE"
    assert data["missing_credential"] is True
    assert "DATA_GOV_IN_API_KEY" in data["message"] + data["setup"]
