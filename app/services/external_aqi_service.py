"""External modelled AQI forecast derived from the Open-Meteo Air Quality API (CAMS).

This module is deliberately independent of the trained Gradient Boosting bundle.
It answers a different question: "what does the CPCB breakpoint method produce if
it is fed forecast concentrations from a coarse global model?"

It is NOT a CPCB observation and NOT the project's trained-model prediction.

Two integrity rules govern everything below:

1. Delhi is served by the CAMS Global domain, whose native temporal resolution is
   3-hourly (~45 km). Open-Meteo resamples that field onto hourly timestamps. Only
   the native 3-hourly values are independent model output; every other hourly
   timestamp is interpolated. This module therefore fetches BOTH series and counts
   coverage claims against the NATIVE series only.
2. CPCB's data-sufficiency rule ("a minimum of 16 hours' data is necessary for
   calculating a sub-index") is about data samples. 24 interpolated timestamps are
   not 24 observations, so the 16-hour rule can never be satisfied from a 3-hourly
   forecast source. The resulting index is therefore reported as an EXPERIMENTAL
   modelled estimate and is explicitly flagged as not CPCB-compliant. It is never
   described as an official CPCB AQI.
"""
from __future__ import annotations

import time
from datetime import date, datetime, time as dtime, timedelta
from typing import Any, Dict, List, Optional, Set
from zoneinfo import ZoneInfo

import httpx

from app.config import settings

IST = ZoneInfo("Asia/Kolkata")

# CPCB National AQI breakpoints, verified against CPCB's published
# AQI-Calculator.xlsx ("Breakpoints" sheet) and "How is AQI Calculated?" PDF.
# Bands are (conc_low, conc_high, index_low, index_high).
# CO is expressed in mg/m3; every other pollutant in ug/m3.
# Concentrations are used exactly as reported: no truncation or rounding is applied
# before interpolation, because CPCB's published method does not specify one.
BREAKPOINTS: Dict[str, List[tuple]] = {
    "PM2.5": [(0, 30, 0, 50), (31, 60, 51, 100), (61, 90, 101, 200),
              (91, 120, 201, 300), (121, 250, 301, 400), (251, 380, 401, 500)],
    "PM10": [(0, 50, 0, 50), (51, 100, 51, 100), (101, 250, 101, 200),
             (251, 350, 201, 300), (351, 430, 301, 400), (431, 510, 401, 500)],
    "NO2": [(0, 40, 0, 50), (41, 80, 51, 100), (81, 180, 101, 200),
            (181, 280, 201, 300), (281, 400, 301, 400), (401, 520, 401, 500)],
    "SO2": [(0, 40, 0, 50), (41, 80, 51, 100), (81, 380, 101, 200),
            (381, 800, 201, 300), (801, 1600, 301, 400), (1601, 2620, 401, 500)],
    "CO": [(0, 1.0, 0, 50), (1.1, 2.0, 51, 100), (2.1, 10.0, 101, 200),
           (10.1, 17.0, 201, 300), (17.1, 34.0, 301, 400), (34.1, 50.0, 401, 500)],
    "O3": [(0, 50, 0, 50), (51, 100, 51, 100), (101, 168, 101, 200),
           (169, 208, 201, 300), (209, 748, 301, 400), (749, 1000, 401, 500)],
}

AVERAGING = {"PM2.5": "24h", "PM10": "24h", "NO2": "24h", "SO2": "24h",
             "CO": "8h", "O3": "8h", "NH3": "24h", "Pb": "24h"}
UNITS = {"PM2.5": "µg/m³", "PM10": "µg/m³", "NO2": "µg/m³", "SO2": "µg/m³",
         "CO": "mg/m³", "O3": "µg/m³"}
# Open-Meteo variable name -> CPCB pollutant. NH3 and Pb have no local availability.
OPEN_METEO_VARS = {"PM2.5": "pm2_5", "PM10": "pm10", "NO2": "nitrogen_dioxide",
                   "SO2": "sulphur_dioxide", "CO": "carbon_monoxide", "O3": "ozone"}

# CPCB: "a minimum of 16 hours' data is considered necessary for calculating a
# sub-index." Counted against NATIVE model values, not interpolated timestamps.
CPCB_MIN_DATA_HOURS = 16
CPCB_MIN_POLLUTANTS = 3
MIN_8H_HOURS = 8
WINDOW_HOURS = 24
BULLETIN_HOUR_IST = 16  # CPCB bulletins report the 24h average ending 16:00 IST
CACHE_TTL_SECONDS = 600

# Provider domain facts (Open-Meteo Air Quality API documentation table).
NATIVE_RESOLUTION_HOURS = 3
NATIVE_SPATIAL_KM = 45
NATIVE_SPATIAL_DEGREES = 0.4

O3_HIGH_8H_THRESHOLD = 208.0  # CPCB footnote: above this, use the 1-hourly average


def _category(aqi: int) -> str:
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Satisfactory"
    if aqi <= 200:
        return "Moderate"
    if aqi <= 300:
        return "Poor"
    if aqi <= 400:
        return "Very Poor"
    return "Severe"


def _sub_index(pollutant: str, concentration: float) -> int:
    """Linear interpolation inside the CPCB breakpoint band.

    The concentration is used as reported. No truncation or pre-rounding is applied,
    since CPCB's published method does not define one and truncation would bias every
    sub-index downwards.
    """
    bands = BREAKPOINTS[pollutant]
    for conc_low, conc_high, index_low, index_high in bands:
        if concentration <= conc_high:
            if conc_high == conc_low:
                return int(index_low)
            value = index_low + (index_high - index_low) * (concentration - conc_low) / (conc_high - conc_low)
            return int(round(value))
    return 500


def _mean(values: List[Optional[float]]) -> Optional[float]:
    clean = [v for v in values if v is not None]
    return sum(clean) / len(clean) if clean else None


class ExternalAqiForecastService:
    """Fetches CAMS forecast concentrations and applies the CPCB AQI method."""

    def __init__(self) -> None:
        self.api_url = "https://air-quality-api.open-meteo.com/v1/air-quality"
        self._cache: Optional[Dict[str, Any]] = None
        self._cache_epoch: float = 0.0
        self._outlook_cache: Optional[Dict[str, Any]] = None
        self._outlook_cache_epoch: float = 0.0
        self._outlook_cache_key: Optional[str] = None
        # A cached response is only reusable for the exact target date and window it
        # was built for, so a forecast cached before midnight can never be served
        # after midnight as "tomorrow".
        self._cache_key: Optional[str] = None

    # ---------------------------------------------------------------- windowing
    @staticmethod
    def _window_for(target: date) -> tuple[datetime, datetime, List[datetime]]:
        """The 24-hour CPCB bulletin window that ends at 16:00 IST on `target`."""
        window_end = datetime.combine(target, dtime(BULLETIN_HOUR_IST, 0), tzinfo=IST)
        window_start = window_end - timedelta(hours=WINDOW_HOURS - 1)
        stamps = [window_start + timedelta(hours=i) for i in range(WINDOW_HOURS)]
        return window_start, window_end, stamps

    @classmethod
    def _window(cls, now_ist: Optional[datetime] = None) -> tuple[date, datetime, datetime, List[datetime]]:
        now = now_ist or datetime.now(IST)
        target = now.date() + timedelta(days=1)
        window_start, window_end, stamps = cls._window_for(target)
        return target, window_start, window_end, stamps

    @staticmethod
    def _cache_key_for(target: date, window_start: datetime, window_end: datetime) -> str:
        return f"{target.isoformat()}|{window_start.isoformat()}|{window_end.isoformat()}"

    # ------------------------------------------------------------------- fetch
    async def _fetch_range(self, start_date: date, end_date: date) -> Dict[str, Dict[str, Any]]:
        """Fetch the hourly and native series for a whole date span.

        The outlook needs several daily windows; fetching the covering span once keeps
        that to two upstream requests instead of two per day.
        """
        params = {
            "latitude": settings.LATITUDE,
            "longitude": settings.LONGITUDE,
            "hourly": ",".join(list(OPEN_METEO_VARS.values()) + ["us_aqi"]),
            "timezone": settings.TIMEZONE,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        }
        hourly = await self._fetch_payload(params)
        native = await self._fetch_payload({**params, "temporal_resolution": f"hourly_{NATIVE_RESOLUTION_HOURS}"})
        return {"hourly": hourly, "native": native}

    async def _fetch_payload(self, params: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(self.api_url, params=params)
        if response.status_code != 200:
            raise RuntimeError(
                f"Open-Meteo Air Quality API returned HTTP {response.status_code}: {response.text[:180]}"
            )
        payload = response.json()
        if payload.get("error"):
            raise RuntimeError(str(payload.get("reason") or "Open-Meteo returned an error payload."))
        return payload

    async def _fetch(self, window_start: datetime, target: date) -> Dict[str, Dict[str, Any]]:
        """Fetch the hourly-resampled series AND the native 3-hourly series.

        Both are required: the averages are computed on the hourly series, while every
        coverage claim is counted on the native series.
        """
        return await self._fetch_range(window_start.date(), target)

    # ------------------------------------------------------------ availability
    @staticmethod
    def _stamps_in_payload(payload: Dict[str, Any], stamps: List[datetime]) -> Set[datetime]:
        """Which requested stamps actually exist in this payload.

        For the native payload this is the set of independent model timestamps; for the
        hourly payload it is every timestamp, including provider-interpolated ones.
        """
        hourly = payload.get("hourly") or {}
        wanted = set(stamps)
        found: Set[datetime] = set()
        for raw in hourly.get("time") or []:
            try:
                stamp = datetime.fromisoformat(raw).replace(tzinfo=IST)
            except ValueError:
                continue
            if stamp in wanted:
                found.add(stamp)
        return found

    @staticmethod
    def _series_by_stamp(payload: Dict[str, Any], stamps: List[datetime]) -> Dict[str, Dict[datetime, Optional[float]]]:
        hourly = payload.get("hourly") or {}
        times = hourly.get("time") or []
        parsed: Dict[str, datetime] = {}
        for raw in times:
            try:
                parsed[raw] = datetime.fromisoformat(raw).replace(tzinfo=IST)
            except ValueError:
                continue
        series: Dict[str, Dict[datetime, Optional[float]]] = {}
        for pollutant, variable in OPEN_METEO_VARS.items():
            values = hourly.get(variable) or []
            by_stamp: Dict[datetime, Optional[float]] = {}
            for index, raw in enumerate(times):
                stamp = parsed.get(raw)
                if stamp is None or stamp not in stamps:
                    continue
                value = values[index] if index < len(values) else None
                if value is None:
                    by_stamp[stamp] = None
                    continue
                # Open-Meteo reports CO in ug/m3; CPCB breakpoints are in mg/m3.
                by_stamp[stamp] = float(value) / 1000.0 if pollutant == "CO" else float(value)
            series[pollutant] = by_stamp
        us_values = hourly.get("us_aqi") or []
        provider: Dict[datetime, Optional[float]] = {}
        for index, raw in enumerate(times):
            stamp = parsed.get(raw)
            if stamp is None or stamp not in stamps:
                continue
            value = us_values[index] if index < len(us_values) else None
            provider[stamp] = float(value) if value is not None else None
        series["__us_aqi__"] = provider
        return series

    # -------------------------------------------------------------- compute AQI
    def _compute(
        self,
        hourly_payload: Dict[str, Any],
        native_payload: Dict[str, Any],
        stamps: List[datetime],
    ) -> Dict[str, Any]:
        hourly = self._series_by_stamp(hourly_payload, stamps)
        native = self._series_by_stamp(native_payload, stamps)
        native_stamps = self._stamps_in_payload(native_payload, stamps)

        sub_indices: List[Dict[str, Any]] = []
        excluded: List[Dict[str, str]] = []

        for pollutant in ("PM2.5", "PM10", "NO2", "SO2", "CO", "O3"):
            values = [hourly[pollutant].get(stamp) for stamp in stamps]
            resampled_available = sum(1 for v in values if v is not None)
            native_values = [native[pollutant].get(stamp) for stamp in sorted(native_stamps)]
            native_available = sum(1 for v in native_values if v is not None)

            if native_available == 0:
                excluded.append({
                    "pollutant": pollutant,
                    "reason": "No native 3-hourly CAMS values for this window; interpolated timestamps alone cannot support an averaging claim.",
                })
                continue

            if AVERAGING[pollutant] == "24h":
                concentration = _mean(values)
                averaging_label = "24h mean of the resampled hourly curve"
                native_used = native_available
            else:
                windows = [values[i:i + MIN_8H_HOURS] for i in range(0, len(values) - MIN_8H_HOURS + 1)]
                complete = [(i, w) for i, w in enumerate(windows) if all(v is not None for v in w)]
                if not complete:
                    excluded.append({
                        "pollutant": pollutant,
                        "reason": f"No complete {MIN_8H_HOURS}-hour block inside the window.",
                    })
                    continue
                best_index = max(complete, key=lambda item: sum(item[1]))[0]
                rolling = [sum(w) / len(w) for _, w in complete]
                concentration = max(rolling)
                native_used = sum(
                    1 for stamp in stamps[best_index:best_index + MIN_8H_HOURS]
                    if stamp in native_stamps and native[pollutant].get(stamp) is not None
                )
                averaging_label = (
                    f"max {MIN_8H_HOURS}h mean of the resampled hourly curve "
                    f"({len(complete)} blocks, {native_used} native values in the selected block)"
                )
                if pollutant == "O3" and concentration > O3_HIGH_8H_THRESHOLD:
                    eight_hour_mean = concentration
                    concentration = max(v for v in values if v is not None)
                    averaging_label = (
                        f"1h peak (8h mean {eight_hour_mean:.1f} > {O3_HIGH_8H_THRESHOLD:g})"
                    )

            if concentration is None:
                excluded.append({"pollutant": pollutant, "reason": "No usable concentrations in window."})
                continue

            sub_indices.append({
                "pollutant": pollutant,
                "concentration": round(float(concentration), 2),
                "unit": UNITS[pollutant],
                "averaging": averaging_label,
                # Coverage is reported on two separate bases so interpolated
                # timestamps can never be read as independent observations.
                "resampled_hours_available": resampled_available,
                "native_values_available": native_available,
                "native_values_used": native_used,
                "window_hours": WINDOW_HOURS,
                "sub_index": _sub_index(pollutant, float(concentration)),
            })

        for pollutant, label in (("NH3", "Ammonia"), ("Pb", "Lead")):
            excluded.append({
                "pollutant": pollutant,
                "reason": f"{label} is not provided for this location by Open-Meteo CAMS.",
            })

        pollutants_used = len(sub_indices)
        particulate_present = any(item["pollutant"] in ("PM2.5", "PM10") for item in sub_indices)
        min_pollutants_met = pollutants_used >= CPCB_MIN_POLLUTANTS and particulate_present

        # CPCB's 16-hour rule is counted on native values. The best case is the largest
        # per-pollutant native count, which is still an upper bound on what the source
        # can support.
        best_native_coverage = max(
            (item["native_values_available"] for item in sub_indices), default=0
        )
        cpcb_16h_met = best_native_coverage >= CPCB_MIN_DATA_HOURS
        cpcb_compliant = bool(min_pollutants_met and cpcb_16h_met)

        native_coverage = {
            "native_resolution_hours": NATIVE_RESOLUTION_HOURS,
            "native_values_in_window": len(native_stamps),
            "resampled_timestamps_in_window": len(stamps),
            "interpolated_timestamps_in_window": len(stamps) - len(native_stamps),
            "best_native_values_per_pollutant": best_native_coverage,
            "cpcb_min_data_hours": CPCB_MIN_DATA_HOURS,
            "cpcb_16h_rule_met": cpcb_16h_met,
            "note": (
                f"The window spans {len(stamps)} hourly timestamps, but only "
                f"{len(native_stamps)} of them are native {NATIVE_RESOLUTION_HOURS}-hourly CAMS values. "
                "The rest are interpolated by the provider and are not independent observations."
            ),
        }

        result: Dict[str, Any] = {
            "sub_indices": sorted(sub_indices, key=lambda item: item["sub_index"], reverse=True),
            "excluded_pollutants": excluded,
            "native_coverage": native_coverage,
            "cpcb_compliant": cpcb_compliant,
            "experimental": not cpcb_compliant,
            "sufficiency": {
                "rule": (
                    "CPCB requires at least 3 pollutants (including PM2.5 or PM10) and "
                    f"{CPCB_MIN_DATA_HOURS} hours of data per sub-index."
                ),
                "pollutants_used": pollutants_used,
                "particulate_present": particulate_present,
                "min_pollutants_met": min_pollutants_met,
                "cpcb_16h_rule_met": cpcb_16h_met,
                "met": cpcb_compliant,
            },
        }

        if min_pollutants_met:
            dominant = max(sub_indices, key=lambda item: item["sub_index"])
            result["aqi"] = int(dominant["sub_index"])
            result["category"] = _category(int(dominant["sub_index"]))
            result["dominant_pollutant"] = dominant["pollutant"]

        us = [v for v in hourly["__us_aqi__"].values() if v is not None]
        if us:
            at_end = hourly["__us_aqi__"].get(stamps[-1])
            result["provider_index"] = {
                "name": "US AQI",
                "scale": "US EPA AQI scale (0-500)",
                "unit": "USAQI",
                "value_at_window_end": int(round(at_end)) if at_end is not None else None,
                "min_in_window": int(round(min(us))),
                "max_in_window": int(round(max(us))),
                "note": (
                    "Provider's own index on the US EPA scale. It is a different index, "
                    "computed on hourly concentrations by Open-Meteo. It is never merged "
                    "with, substituted for, or relabelled as a CPCB India AQI."
                ),
            }
        else:
            result["provider_index"] = None
        return result

    # ------------------------------------------------------------------ public
    async def get_next_day_forecast(
        self,
        use_cache: bool = True,
        now_ist: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        target, window_start, window_end, stamps = self._window(now_ist)
        cache_key = self._cache_key_for(target, window_start, window_end)
        retrieved_at = datetime.now(IST).isoformat(timespec="seconds")

        if (
            use_cache
            and self._cache
            and self._cache_key == cache_key
            and (time.time() - self._cache_epoch) < CACHE_TTL_SECONDS
        ):
            cached = dict(self._cache)
            cached["cached"] = True
            return cached

        base = {
            "kind": "external_modelled_forecast",
            "is_trained_model_output": False,
            "label": (
                "External modelled AQI estimate — CPCB breakpoints applied locally to "
                "Open-Meteo/CAMS forecast concentrations (not the trained model)"
            ),
            "target_date": target.isoformat(),
            "window": {
                "start": window_start.isoformat(timespec="minutes"),
                "end": window_end.isoformat(timespec="minutes"),
                "hours_required": WINDOW_HOURS,
                "convention": "CPCB bulletin convention: 24-hour average ending 16:00 IST",
            },
            "provider": {
                "name": "Open-Meteo Air Quality API",
                "dataset": "CAMS Global Atmospheric Composition Forecast",
                "attribution": (
                    "CAMS ENSEMBLE data, produced by the Copernicus Atmosphere Monitoring "
                    "Service (CAMS) and served via Open-Meteo"
                ),
                "native_resolution": {
                    "temporal": f"{NATIVE_RESOLUTION_HOURS}-hourly",
                    "hours": NATIVE_RESOLUTION_HOURS,
                    "spatial_degrees": NATIVE_SPATIAL_DEGREES,
                    "spatial_km": NATIVE_SPATIAL_KM,
                    "note": (
                        f"CAMS Global native resolution is {NATIVE_RESOLUTION_HOURS}-hourly at "
                        f"~{NATIVE_SPATIAL_KM} km. Open-Meteo resamples that field onto hourly "
                        "timestamps, so intermediate hourly values are interpolated, not "
                        "independent observations."
                    ),
                },
                "update_cadence": (
                    "CAMS Global is refreshed every 12 hours; 'retrieved_at' is this app's "
                    "fetch time, not the model run time."
                ),
                "url": self.api_url,
            },
            "retrieved_at": retrieved_at,
            "cached": False,
        }

        try:
            payloads = await self._fetch(window_start, target)
        except Exception as exc:  # network, HTTP, JSON, upstream errors
            return {
                **base,
                "status": "ERROR",
                "aqi": None,
                "category": None,
                "dominant_pollutant": None,
                "sub_indices": [],
                "excluded_pollutants": [],
                "native_coverage": None,
                "cpcb_compliant": False,
                "experimental": True,
                "sufficiency": {
                    "rule": "",
                    "pollutants_used": 0,
                    "particulate_present": False,
                    "min_pollutants_met": False,
                    "cpcb_16h_rule_met": False,
                    "met": False,
                },
                "provider_index": None,
                "message": "External forecast provider could not be reached.",
                "reasons": [str(exc)],
            }

        hourly_payload = payloads["hourly"]
        native_payload = payloads["native"]

        grid = {
            "latitude": hourly_payload.get("latitude"),
            "longitude": hourly_payload.get("longitude"),
            "timezone": hourly_payload.get("timezone"),
            "utc_offset_seconds": hourly_payload.get("utc_offset_seconds"),
        }
        base["provider"]["grid"] = grid

        computed = self._compute(hourly_payload, native_payload, stamps)
        response: Dict[str, Any] = {**base, **computed}

        if not computed["sufficiency"]["min_pollutants_met"]:
            reasons = [
                f"Only {computed['sufficiency']['pollutants_used']} pollutant(s) had sufficient forecast data.",
                "CPCB requires at least 3 pollutants with PM2.5 or PM10 present.",
            ]
            reasons += [f"{item['pollutant']}: {item['reason']}" for item in computed["excluded_pollutants"]]
            response.update({
                "status": "UNAVAILABLE",
                "aqi": None,
                "category": None,
                "dominant_pollutant": None,
                "message": "No Indian-scale index can be computed for this window from modelled concentrations.",
                "reasons": reasons,
            })
            return response

        response["status"] = "OK"

        if not computed["cpcb_compliant"]:
            coverage = computed["native_coverage"]
            response["method_note"] = (
                f"EXPERIMENTAL — modelled, not CPCB-compliant. The window contains "
                f"{coverage['native_values_in_window']} native {NATIVE_RESOLUTION_HOURS}-hourly CAMS values "
                f"inside {coverage['resampled_timestamps_in_window']} hourly timestamps, so CPCB's "
                f"{CPCB_MIN_DATA_HOURS}-hour requirement cannot be verified from this source. "
                "Sub-indices are computed on provider-resampled hourly values using CPCB's published "
                "breakpoints and averaging windows, and are not an official CPCB AQI."
            )
        response["aqi_basis"] = "cpcb_breakpoints_on_resampled_cams_hourly_values"

        self._cache = response
        self._cache_epoch = time.time()
        self._cache_key = cache_key
        return response

    # ------------------------------------------------------------------ outlook
    async def get_outlook(
        self,
        days: int = 4,
        use_cache: bool = True,
        now_ist: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Today plus the next `days - 1` days, each as its own bulletin window.

        Day 0 covers the window ending 16:00 IST today and is reported as
        `current_estimate`; the remaining days are `forecast`. Every day is computed
        from the same two upstream payloads but with its own 24 hourly stamps, so a
        day is never a running average of its neighbours and no day borrows another
        day's sub-indices. A day whose sufficiency rules fail keeps `aqi: null` -- it
        is never filled from a neighbouring day or the provider's US-scale index.
        """
        if days < 1:
            raise ValueError("days must be at least 1")

        first_day = (now_ist or datetime.now(IST)).date()
        targets = [first_day + timedelta(days=offset) for offset in range(days)]
        windows = {target: self._window_for(target) for target in targets}
        cache_key = "|".join(target.isoformat() for target in targets)
        retrieved_at = datetime.now(IST).isoformat(timespec="seconds")

        if (
            use_cache
            and self._outlook_cache
            and self._outlook_cache_key == cache_key
            and (time.time() - self._outlook_cache_epoch) < CACHE_TTL_SECONDS
        ):
            cached = dict(self._outlook_cache)
            cached["cached"] = True
            return cached

        base: Dict[str, Any] = {
            "kind": "external_modelled_outlook",
            "is_trained_model_output": False,
            "label": (
                "External modelled outlook — CPCB breakpoints applied locally to "
                "Open-Meteo/CAMS forecast concentrations (not the trained model, not "
                "observed CPCB station data)"
            ),
            "convention": (
                "Each day is a 24-hour average ending 16:00 IST (CPCB bulletin convention). "
                "Day 0 is today's window and is a modelled current estimate, not an observation."
            ),
            "days": [],
            "provider": {
                "name": "Open-Meteo Air Quality API",
                "dataset": "CAMS Global Atmospheric Composition Forecast",
                "attribution": (
                    "CAMS ENSEMBLE data, produced by the Copernicus Atmosphere Monitoring "
                    "Service (CAMS) and served via Open-Meteo"
                ),
                "native_resolution": {
                    "temporal": f"{NATIVE_RESOLUTION_HOURS}-hourly",
                    "hours": NATIVE_RESOLUTION_HOURS,
                    "spatial_degrees": NATIVE_SPATIAL_DEGREES,
                    "spatial_km": NATIVE_SPATIAL_KM,
                    "note": (
                        f"CAMS Global native resolution is {NATIVE_RESOLUTION_HOURS}-hourly at "
                        f"~{NATIVE_SPATIAL_KM} km. Intermediate hourly values are interpolated "
                        "by the provider, not independent observations."
                    ),
                },
                "update_cadence": (
                    "CAMS Global is refreshed every 12 hours; 'retrieved_at' is this app's "
                    "fetch time, not the model run time."
                ),
                "url": self.api_url,
            },
            "retrieved_at": retrieved_at,
            "cached": False,
        }

        try:
            payloads = await self._fetch_range(windows[targets[0]][0].date(), targets[-1])
        except Exception as exc:  # network, HTTP, JSON, upstream errors
            return {
                **base,
                "status": "ERROR",
                "days": [],
                "best_available_lead_day": None,
                "message": "External forecast provider could not be reached.",
                "reasons": [str(exc)],
            }

        hourly_payload = payloads["hourly"]
        native_payload = payloads["native"]
        base["provider"]["grid"] = {
            "latitude": hourly_payload.get("latitude"),
            "longitude": hourly_payload.get("longitude"),
            "timezone": hourly_payload.get("timezone"),
            "utc_offset_seconds": hourly_payload.get("utc_offset_seconds"),
        }

        for lead, target in enumerate(targets):
            window_start, window_end, stamps = windows[target]
            computed = self._compute(hourly_payload, native_payload, stamps)
            aqi = computed.get("aqi")
            day: Dict[str, Any] = {
                "target_date": target.isoformat(),
                "lead_days": lead,
                "role": "current_estimate" if lead == 0 else "forecast",
                "window": {
                    "start": window_start.isoformat(timespec="minutes"),
                    "end": window_end.isoformat(timespec="minutes"),
                    "hours_required": WINDOW_HOURS,
                },
                "status": "OK" if aqi is not None else "UNAVAILABLE",
                "aqi": aqi,
                "category": computed.get("category"),
                "dominant_pollutant": computed.get("dominant_pollutant"),
                "sub_indices": computed["sub_indices"],
                "excluded_pollutants": computed["excluded_pollutants"],
                "sufficiency": computed["sufficiency"],
                "native_coverage": computed["native_coverage"],
                "provider_index": computed["provider_index"],
                "cpcb_compliant": computed["cpcb_compliant"],
                "experimental": computed["experimental"],
            }
            if aqi is None:
                day["reasons"] = [
                    f"Only {computed['sufficiency']['pollutants_used']} pollutant(s) had sufficient "
                    "forecast data in this window; CPCB requires at least 3 including PM2.5 or PM10.",
                ] + [f"{item['pollutant']}: {item['reason']}" for item in computed["excluded_pollutants"]]
            base["days"].append(day)

        usable = [day for day in base["days"] if day["aqi"] is not None]
        base["status"] = "OK" if usable else "UNAVAILABLE"
        base["best_available_lead_day"] = usable[0]["lead_days"] if usable else None
        if usable:
            base["experimental"] = any(day["experimental"] for day in usable)
            base["cpcb_compliant"] = all(day["cpcb_compliant"] for day in usable)
            if any(day["experimental"] for day in usable):
                base["method_note"] = (
                    "EXPERIMENTAL — modelled, not CPCB-compliant. The source's native "
                    f"{NATIVE_RESOLUTION_HOURS}-hour spacing cannot satisfy CPCB's "
                    f"{CPCB_MIN_DATA_HOURS}-hour requirement, so these are experimental "
                    "CPCB-method estimates, not an official CPCB AQI."
                )
        else:
            base["experimental"] = True
            base["cpcb_compliant"] = False
            base["message"] = "No Indian-scale index can be computed for these windows from modelled concentrations."

        self._outlook_cache = base
        self._outlook_cache_epoch = time.time()
        self._outlook_cache_key = cache_key
        return base


external_aqi_service = ExternalAqiForecastService()
