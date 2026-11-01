"""Unit tests for the external (Open-Meteo CAMS) modelled AQI forecast service.

These tests cover the integrity rules that matter for this source:

* native 3-hourly values must never be conflated with provider-interpolated hourly
  timestamps;
* CPCB's 16-hour data requirement is counted on native values only, so a 3-hourly
  forecast source can never be reported as CPCB-compliant;
* concentrations are used as provided (no undocumented truncation);
* a cached forecast can never cross midnight and describe the wrong day.

No network access is used: `_fetch` is replaced with synthetic payloads.
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, time as dtime, timedelta
from typing import Any, Dict, List, Optional

import pytest

from app.services.external_aqi_service import (
    BREAKPOINTS,
    CPCB_MIN_DATA_HOURS,
    ExternalAqiForecastService,
    IST,
    _sub_index,
)

# Constant synthetic concentrations, in the provider's units (µg/m³, CO in µg/m³).
BASE_VALUES = {
    "pm2_5": 40.0,
    "pm10": 60.0,
    "nitrogen_dioxide": 50.0,
    "sulphur_dioxide": 30.0,
    "carbon_monoxide": 1000.0,  # -> 1.0 mg/m³
    "ozone": 80.0,
    "us_aqi": 100.0,
    "ammonia": None,
}

WINDOW_START, WINDOW_TARGET = datetime(2026, 10, 29, 3, 0, tzinfo=IST), date(2026, 10, 30)


def _payload(stamps: List[datetime], values: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    values = BASE_VALUES if values is None else values
    hourly: Dict[str, Any] = {"time": [s.strftime("%Y-%m-%dT%H:%M") for s in stamps]}
    for variable in ("pm2_5", "pm10", "nitrogen_dioxide", "sulphur_dioxide",
                     "carbon_monoxide", "ozone", "us_aqi", "ammonia"):
        hourly[variable] = [values.get(variable) for _ in stamps]
    return {
        "latitude": 28.6,
        "longitude": 77.2,
        "timezone": "Asia/Kolkata",
        "utc_offset_seconds": 19800,
        "hourly_units": {},
        "hourly": hourly,
    }


def _stamps_for(window_start: datetime, target: date) -> List[datetime]:
    start = datetime.combine(window_start.date(), dtime(0, 0), tzinfo=IST)
    end = datetime.combine(target, dtime(23, 0), tzinfo=IST)
    stamps: List[datetime] = []
    current = start
    while current <= end:
        stamps.append(current)
        current += timedelta(hours=1)
    return stamps


def _native_stamps(stamps: List[datetime], every: int = 3) -> List[datetime]:
    return [s for s in stamps if s.hour % every == 0]


def _service() -> ExternalAqiForecastService:
    return ExternalAqiForecastService()


def _compute_for(window_start: datetime, target: date, *, native_every: int = 3,
                 native_values: Optional[Dict[str, Any]] = None):
    service = _service()
    _, _, _, window_stamps = service._window(window_start)
    stamps = _stamps_for(window_start, target)
    assert set(window_stamps).issubset(set(stamps))
    hourly = _payload(stamps)
    native = _payload(_native_stamps(stamps, native_every), native_values)
    return service._compute(hourly, native, window_stamps), stamps


# --------------------------------------------------------------------- sub-index
def test_sub_index_uses_concentration_without_truncation():
    """20.81 µg/m³ must interpolate, not be floored to 20."""
    assert _sub_index("PM2.5", 20.81) == pytest.approx(35, abs=1)
    # 50 * 20.81 / 30 = 34.68 -> 35. The removed truncation would have produced 33.
    assert _sub_index("PM2.5", 20.81) == 35
    assert _sub_index("PM2.5", 20.0) == 33


def test_sub_index_matches_cpcb_breakpoint_endpoints():
    assert _sub_index("PM2.5", 30.0) == 50
    assert _sub_index("PM2.5", 60.0) == 100
    assert _sub_index("PM2.5", 90.0) == 200
    assert _sub_index("PM10", 50.0) == 50
    assert _sub_index("PM10", 100.0) == 100
    assert _sub_index("NO2", 40.0) == 50
    assert _sub_index("SO2", 40.0) == 50
    assert _sub_index("CO", 1.0) == 50
    assert _sub_index("CO", 2.0) == 100
    assert _sub_index("O3", 100.0) == 100
    assert _sub_index("O3", 168.0) == 200


def test_sub_index_interpolates_fractional_values_that_truncation_would_hide():
    # 32.62 µg/m³ PM10: 50 * 32.62 / 50 = 32.62 -> 33 (truncation gave 32).
    assert _sub_index("PM10", 32.62) == 33
    # 0.76 mg/m³ CO: 50 * 0.76 / 1.0 = 38 (truncation to 0.7 gave 35).
    assert _sub_index("CO", 0.76) == 38
    assert _sub_index("O3", 116.12) == 123


def test_sub_index_caps_at_500():
    assert _sub_index("PM2.5", 900.0) == 500
    assert _sub_index("PM10", 900.0) == 500


def test_sub_index_band_gaps_follow_published_table():
    """CPCB's integer breakpoints leave gaps (1.0 -> 1.1 mg/m³ CO). The published
    cascade walks straight from the lower edge of the next band, so a concentration
    inside the gap does not get an invented band."""
    assert len(BREAKPOINTS["CO"]) == 6
    assert _sub_index("CO", 1.05) == 48  # 51 + 49 * (1.05 - 1.1) / 0.9 = 48.3


# ------------------------------------------------- native vs resampled coverage
def test_native_values_are_counted_separately_from_resampled_timestamps():
    result, _ = _compute_for(WINDOW_START, WINDOW_TARGET)
    coverage = result["native_coverage"]

    assert coverage["native_resolution_hours"] == 3
    assert coverage["native_values_in_window"] == 8          # 24 h / 3 h
    assert coverage["resampled_timestamps_in_window"] == 24
    assert coverage["interpolated_timestamps_in_window"] == 16
    assert coverage["cpcb_16h_rule_met"] is False
    assert result["cpcb_compliant"] is False
    assert result["experimental"] is True
    assert "interpolated" in coverage["note"]


def test_24h_sub_indices_report_both_coverage_bases():
    result, _ = _compute_for(WINDOW_START, WINDOW_TARGET)
    by_name = {item["pollutant"]: item for item in result["sub_indices"]}

    assert by_name["PM2.5"]["resampled_hours_available"] == 24
    assert by_name["PM2.5"]["native_values_available"] == 8
    assert by_name["PM2.5"]["native_values_used"] == 8
    assert "resampled hourly curve" in by_name["PM2.5"]["averaging"]
    assert by_name["PM2.5"]["window_hours"] == 24


def test_8h_sub_indices_use_one_block_and_report_its_native_values():
    result, _ = _compute_for(WINDOW_START, WINDOW_TARGET)
    by_name = {item["pollutant"]: item for item in result["sub_indices"]}

    for name in ("CO", "O3"):
        item = by_name[name]
        # 8 consecutive hourly stamps can contain at most 3 native 3-hourly values.
        assert 1 <= item["native_values_used"] <= 3
        assert item["native_values_used"] <= item["native_values_available"] == 8
        assert "resampled hourly curve" in item["averaging"]


def test_resampled_timestamps_cannot_satisfy_the_16_hour_rule():
    """Even with all 24 hourly timestamps present, native coverage is 8 and the
    CPCB 16-hour rule must remain unmet."""
    result, _ = _compute_for(WINDOW_START, WINDOW_TARGET)
    coverage = result["native_coverage"]

    assert coverage["resampled_timestamps_in_window"] == 24 >= CPCB_MIN_DATA_HOURS
    assert coverage["native_values_in_window"] < CPCB_MIN_DATA_HOURS
    assert result["sufficiency"]["cpcb_16h_rule_met"] is False
    assert result["sufficiency"]["met"] is False
    # The number is still produced, but only as an explicitly experimental estimate.
    assert result["aqi"] is not None
    assert result["experimental"] is True


def test_aqi_is_the_worst_sub_index():
    result, _ = _compute_for(WINDOW_START, WINDOW_TARGET)
    assert result["aqi"] == max(item["sub_index"] for item in result["sub_indices"])
    assert result["dominant_pollutant"] == "O3"   # constant 80 µg/m³ O3 -> 80
    assert result["category"] == "Satisfactory"


# ------------------------------------------------------- insufficient data paths
def test_no_native_values_excludes_pollutants_and_withholds_the_index():
    empty_native = {key: None for key in BASE_VALUES}
    result, _ = _compute_for(WINDOW_START, WINDOW_TARGET, native_values=empty_native)

    assert result["native_coverage"]["native_values_in_window"] == 8
    assert result["sub_indices"] == []
    assert "aqi" not in result
    assert result["sufficiency"]["min_pollutants_met"] is False
    assert any("No native 3-hourly CAMS values" in item["reason"]
               for item in result["excluded_pollutants"])


def test_missing_native_values_reduce_reported_native_coverage():
    service = _service()
    _, _, _, window_stamps = service._window(WINDOW_START)
    stamps = _stamps_for(WINDOW_START, WINDOW_TARGET)
    native_stamps = _native_stamps(stamps)

    native_payload = _payload(native_stamps)
    # Blank all but the last two native PM2.5 values that fall inside the forecast window.
    in_window = [index for index, stamp in enumerate(native_stamps) if stamp in set(window_stamps)]
    keep = set(in_window[-2:])
    native_payload["hourly"]["pm2_5"] = [
        40.0 if index in keep else None for index in range(len(native_stamps))
    ]
    result = service._compute(_payload(stamps), native_payload, window_stamps)
    by_name = {item["pollutant"]: item for item in result["sub_indices"]}

    assert by_name["PM2.5"]["native_values_available"] == 2
    assert by_name["PM2.5"]["resampled_hours_available"] == 24
    assert result["native_coverage"]["cpcb_16h_rule_met"] is False


def test_too_few_pollutants_withholds_the_index():
    service = _service()
    _, _, _, window_stamps = service._window(WINDOW_START)
    stamps = _stamps_for(WINDOW_START, WINDOW_TARGET)
    only_two = {key: None for key in BASE_VALUES}
    only_two["ozone"] = 80.0
    only_two["carbon_monoxide"] = 1000.0

    result = service._compute(_payload(stamps, only_two),
                              _payload(_native_stamps(stamps), only_two),
                              window_stamps)
    assert result["sufficiency"]["pollutants_used"] == 2
    assert result["sufficiency"]["min_pollutants_met"] is False
    assert "aqi" not in result


def test_no_complete_8h_block_excludes_co_and_o3():
    service = _service()
    _, _, _, window_stamps = service._window(WINDOW_START)
    stamps = _stamps_for(WINDOW_START, WINDOW_TARGET)
    values = dict(BASE_VALUES)
    payload = _payload(stamps, values)
    # Blank every second hourly stamp: 24h pollutants still have 12 samples, but no
    # 8-hour block is complete for CO/O3.
    payload["hourly"]["ozone"] = [v if index % 2 == 0 else None for index, v in enumerate(payload["hourly"]["ozone"])]
    payload["hourly"]["carbon_monoxide"] = [v if index % 2 == 0 else None for index, v in enumerate(payload["hourly"]["carbon_monoxide"])]

    native = _payload(_native_stamps(stamps))
    native["hourly"]["ozone"] = [v if index % 2 == 0 else None for index, v in enumerate(native["hourly"]["ozone"])]
    native["hourly"]["carbon_monoxide"] = [v if index % 2 == 0 else None for index, v in enumerate(native["hourly"]["carbon_monoxide"])]

    result = service._compute(payload, native, window_stamps)
    used = {item["pollutant"] for item in result["sub_indices"]}
    reasons = {item["pollutant"]: item["reason"] for item in result["excluded_pollutants"]}

    assert "O3" not in used and "CO" not in used
    assert "No complete 8-hour block" in reasons["O3"]
    assert "PM2.5" in used  # 24h rule still satisfied by the remaining 12 samples


# ---------------------------------------------------------------- cache/rollover
def _fake_fetch(window_start: datetime, target: date) -> Dict[str, Any]:
    stamps = _stamps_for(window_start, target)
    return {"hourly": _payload(stamps), "native": _payload(_native_stamps(stamps))}


def test_cache_is_reused_within_the_same_window():
    async def run():
        service = _service()
        service._fetch = lambda window_start, target: _async_return(_fake_fetch(window_start, target))
        now = datetime(2026, 10, 29, 23, 55, tzinfo=IST)
        first = await service.get_next_day_forecast(now_ist=now)
        second = await service.get_next_day_forecast(now_ist=now)
        return first, second

    first, second = asyncio.run(run())
    assert first["target_date"] == "2026-10-30"
    assert first["cached"] is False
    assert second["cached"] is True
    assert second["target_date"] == first["target_date"]
    assert second["retrieved_at"] == first["retrieved_at"]


def test_cache_does_not_survive_midnight():
    async def run():
        service = _service()
        service._fetch = lambda window_start, target: _async_return(_fake_fetch(window_start, target))
        before = await service.get_next_day_forecast(now_ist=datetime(2026, 10, 29, 23, 55, tzinfo=IST))
        after = await service.get_next_day_forecast(now_ist=datetime(2026, 10, 30, 0, 5, tzinfo=IST))
        return before, after

    before, after = asyncio.run(run())
    assert before["target_date"] == "2026-10-30"
    assert after["cached"] is False
    assert after["target_date"] == "2026-10-31"
    assert after["window"]["start"] == "2026-10-30T17:00+05:30"
    assert after["window"]["end"] == "2026-10-31T16:00+05:30"
    assert after["window"]["end"] != before["window"]["end"]


def test_provider_failure_returns_error_without_a_number():
    async def run():
        service = _service()

        async def boom(window_start, target):
            raise RuntimeError("upstream unavailable")

        service._fetch = boom
        return await service.get_next_day_forecast()

    result = asyncio.run(run())
    assert result["status"] == "ERROR"
    assert result["aqi"] is None
    assert result["provider_index"] is None
    assert result["is_trained_model_output"] is False
    assert "upstream unavailable" in " ".join(result["reasons"])


# --------------------------------------------------------------------- metadata
def test_response_metadata_states_native_resolution_and_attribution():
    async def run():
        service = _service()
        service._fetch = lambda window_start, target: _async_return(_fake_fetch(window_start, target))
        return await service.get_next_day_forecast()

    result = asyncio.run(run())
    provider = result["provider"]
    assert "Open-Meteo" in provider["name"]
    assert "CAMS" in provider["dataset"]
    assert "CAMS ENSEMBLE" in provider["attribution"]
    assert "Copernicus" in provider["attribution"]
    assert provider["native_resolution"]["hours"] == 3
    assert provider["native_resolution"]["spatial_km"] == 45
    assert "12 hours" in provider["update_cadence"]
    assert result["experimental"] is True
    assert result["cpcb_compliant"] is False
    assert "not CPCB-compliant" in result["method_note"]
    assert result["aqi_basis"] == "cpcb_breakpoints_on_resampled_cams_hourly_values"


def test_provider_index_is_labelled_as_us_epa_scale():
    async def run():
        service = _service()
        service._fetch = lambda window_start, target: _async_return(_fake_fetch(window_start, target))
        return await service.get_next_day_forecast()

    result = asyncio.run(run())
    provider_index = result["provider_index"]
    assert provider_index["unit"] == "USAQI"
    assert "US EPA" in provider_index["scale"]
    assert "never merged" in provider_index["note"]
    # The Indian-scale estimate and the US index live in separate fields and are
    # not derived from one another: constant O3 80 µg/m³ -> 80, constant USAQI 100.
    assert result["aqi"] == 80
    assert provider_index["value_at_window_end"] == 100
    assert result["aqi_basis"] == "cpcb_breakpoints_on_resampled_cams_hourly_values"


def test_service_is_independent_of_the_trained_model():
    from app.services.external_aqi_service import external_aqi_service

    assert not hasattr(external_aqi_service, "_bundle")
    assert not hasattr(external_aqi_service, "predict")


# ------------------------------------------------------------------- outlook
def _fake_range(start: date, end: date) -> Dict[str, Any]:
    stamps: List[datetime] = []
    current = datetime.combine(start, dtime(0, 0), tzinfo=IST)
    stop = datetime.combine(end, dtime(23, 0), tzinfo=IST)
    while current <= stop:
        stamps.append(current)
        current += timedelta(hours=1)
    return {"hourly": _payload(stamps), "native": _payload(_native_stamps(stamps))}


def test_outlook_returns_one_independent_window_per_day():
    async def run():
        service = _service()
        service._fetch_range = lambda start, end: _async_return(_fake_range(start, end))
        return await service.get_outlook(now_ist=datetime(2026, 10, 29, 23, 55, tzinfo=IST))

    result = asyncio.run(run())
    days = result["days"]

    assert [day["lead_days"] for day in days] == [0, 1, 2, 3]
    assert [day["target_date"] for day in days] == [
        "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01",
    ]
    assert days[0]["role"] == "current_estimate"
    assert all(day["role"] == "forecast" for day in days[1:])

    # Each day owns its own CPCB bulletin window, not a running average.
    assert days[1]["window"]["start"] == "2026-10-29T17:00+05:30"
    assert days[1]["window"]["end"] == "2026-10-30T16:00+05:30"
    assert days[3]["window"]["end"] == "2026-11-01T16:00+05:30"

    assert all(day["native_coverage"]["native_values_in_window"] == 8 for day in days)
    assert all(day["experimental"] is True for day in days)
    assert result["status"] == "OK"
    assert result["best_available_lead_day"] == 0
    assert result["is_trained_model_output"] is False
    assert "not the trained model" in result["label"]


def test_outlook_day_without_enough_pollutants_stays_null():
    """A window with too few usable pollutants must not borrow a neighbouring day's index."""

    async def run():
        service = _service()
        span = _fake_range(date(2026, 10, 29), date(2026, 11, 1))
        # Blank the air-quality variables for the second day's window (ending 16:00 on
        # 2026-10-30), keeping the timestamps present but the values missing.
        blank_start = datetime(2026, 10, 29, 17, 0, tzinfo=IST)
        blank_end = datetime(2026, 10, 30, 16, 0, tzinfo=IST)
        times = [datetime.fromisoformat(raw).replace(tzinfo=IST) for raw in span["hourly"]["hourly"]["time"]]
        masked = []
        for stamp in times:
            masked.append(blank_start <= stamp <= blank_end)
        for variable in ("pm2_5", "pm10", "nitrogen_dioxide", "sulphur_dioxide",
                         "carbon_monoxide", "ozone"):
            values = span["hourly"]["hourly"][variable]
            span["hourly"]["hourly"][variable] = [
                None if is_blank else value for value, is_blank in zip(values, masked)
            ]
            native_values = span["native"]["hourly"][variable]
            native_times = span["native"]["hourly"]["time"]
            span["native"]["hourly"][variable] = [
                None if blank_start <= datetime.fromisoformat(raw).replace(tzinfo=IST) <= blank_end else value
                for raw, value in zip(native_times, native_values)
            ]
        service._fetch_range = lambda start, end: _async_return(span)
        return await service.get_outlook(now_ist=datetime(2026, 10, 29, 23, 55, tzinfo=IST))

    result = asyncio.run(run())
    days = result["days"]
    assert days[1]["aqi"] is None
    assert days[1]["status"] == "UNAVAILABLE"
    assert days[1]["category"] is None
    assert any("CPCB requires at least 3" in reason for reason in days[1]["reasons"])
    # The other days are unaffected and the response as a whole is still usable.
    assert days[0]["aqi"] is not None and days[2]["aqi"] is not None
    assert result["status"] == "OK"


def test_outlook_provider_failure_returns_error_and_no_days():
    async def run():
        service = _service()

        async def boom(start, end):
            raise RuntimeError("upstream unavailable")

        service._fetch_range = boom
        return await service.get_outlook(now_ist=datetime(2026, 10, 29, 12, 0, tzinfo=IST))

    result = asyncio.run(run())
    assert result["status"] == "ERROR"
    assert result["days"] == []
    assert result["best_available_lead_day"] is None
    assert result["is_trained_model_output"] is False
    assert "upstream unavailable" in " ".join(result["reasons"])


def test_outlook_cache_is_reused_within_the_same_day():
    async def run():
        service = _service()
        service._fetch_range = lambda start, end: _async_return(_fake_range(start, end))
        now = datetime(2026, 10, 29, 9, 0, tzinfo=IST)
        first = await service.get_outlook(now_ist=now)
        second = await service.get_outlook(now_ist=now)
        return first, second

    first, second = asyncio.run(run())
    assert first["cached"] is False
    assert second["cached"] is True
    assert second["retrieved_at"] == first["retrieved_at"]


# ------------------------------------------------------------------------ helper
async def _async_return(value):
    return value
