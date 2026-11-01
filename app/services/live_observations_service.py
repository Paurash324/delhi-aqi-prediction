"""Live station-observations service for the data.gov.in real-time CPCB resource.

Scope and integrity rules
-------------------------
* This service returns reported pollutant values exactly as published by the
  Government of India open-data platform (data.gov.in), whose records originate
  from CPCB / DPCC monitoring stations.
* It does NOT compute an AQI and it does NOT feed the trained model. The source
  response contains no unit or averaging-window field, so a CPCB sub-index cannot
  be derived from it without guessing. The trained bundle additionally requires
  seven days of compatible derived-AQI history that does not exist for 2026.
* The API key is read from the ``DATA_GOV_IN_API_KEY`` environment variable at
  call time. It is never logged, returned, persisted in the cache file, or echoed
  in an error message.

Everything below therefore reports raw observations, a freshness assessment, and
explicit warnings about unverified units.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import httpx

from app.config import settings

IST = ZoneInfo("Asia/Kolkata")

RESOURCE_ID = "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
API_URL = f"https://api.data.gov.in/resource/{RESOURCE_ID}"
RESOURCE_TITLE = "Real time Air Quality Index from various locations"

# Timestamps in this resource are published as bare wall-clock strings.
LAST_UPDATE_FORMAT = "%d-%m-%Y %H:%M:%S"


class ObservationsUpstreamError(RuntimeError):
    """Upstream transport/HTTP/shape failure, already safe to show to a client."""


class LiveObservationsService:
    """Fetches and normalises the data.gov.in Delhi station snapshot."""

    def __init__(self) -> None:
        self._cache: Optional[Dict[str, Any]] = None
        self._cache_epoch: float = 0.0

    # ------------------------------------------------------------------ config
    @property
    def api_key(self) -> str:
        return settings.data_gov_in_api_key

    def _redact(self, text: str) -> str:
        """Remove the credential from any text that could reach a client."""
        key = self.api_key
        if key and key in text:
            text = text.replace(key, "***")
        return text

    # ------------------------------------------------------------------- fetch
    async def _fetch_records(self) -> Dict[str, Any]:
        """Perform the single HTTP GET and return the parsed JSON object.

        Kept as its own method so tests can substitute payloads without network
        access. Raises ObservationsUpstreamError with a safe message.
        """
        params = {
            "api-key": self.api_key,
            "format": "json",
            "limit": settings.OBSERVATIONS_RECORD_LIMIT,
            f"filters[city]": settings.OBSERVATIONS_CITY,
        }
        async with httpx.AsyncClient(timeout=settings.OBSERVATIONS_TIMEOUT_SECONDS) as client:
            response = await client.get(API_URL, params=params)

        if response.status_code != 200:
            raise ObservationsUpstreamError(
                self._redact(f"data.gov.in returned HTTP {response.status_code}.")
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise ObservationsUpstreamError(
                self._redact(f"data.gov.in returned an unreadable JSON payload: {exc}")
            ) from None
        if not isinstance(payload, dict):
            raise ObservationsUpstreamError("data.gov.in returned a non-object payload.")
        return payload

    # ------------------------------------------------------------------ parsing
    @staticmethod
    def _number(value: Any) -> Optional[float]:
        """Parse a reported numeric field, treating NA as not reported."""
        if value is None:
            return None
        text = str(value).strip()
        if text == "" or text.upper() in {"NA", "N/A", "NULL", "NONE", "-"}:
            return None
        try:
            return float(text)
        except ValueError:
            return None

    @staticmethod
    def _parse_last_update(raw: Any) -> Optional[datetime]:
        text = str(raw or "").strip()
        if not text:
            return None
        try:
            return datetime.strptime(text, LAST_UPDATE_FORMAT).replace(tzinfo=IST)
        except ValueError:
            return None

    def _normalise(
        self, payload: Dict[str, Any]
    ) -> tuple[List[Dict[str, Any]], int, List[Dict[str, Any]], Optional[int], bool]:
        """Return (stations, skipped_records, pollutant_summary, source_total, truncated)."""
        records = payload.get("records")
        if not isinstance(records, list):
            raise ObservationsUpstreamError(
                "data.gov.in payload did not contain a records list."
            )

        by_station: Dict[str, Dict[str, Any]] = {}
        skipped = 0

        for raw in records:
            if not isinstance(raw, dict):
                skipped += 1
                continue
            station_name = str(raw.get("station") or "").strip()
            pollutant_id = str(raw.get("pollutant_id") or "").strip()
            if not station_name or not pollutant_id:
                skipped += 1
                continue

            station = by_station.get(station_name)
            if station is None:
                station = {
                    "station": station_name,
                    "latitude": self._number(raw.get("latitude")),
                    "longitude": self._number(raw.get("longitude")),
                    "last_update_raw": str(raw.get("last_update") or "").strip() or None,
                    "pollutants": [],
                }
                by_station[station_name] = station

            station["pollutants"].append(
                {
                    "pollutant": pollutant_id,
                    "reported_min": self._number(raw.get("min_value")),
                    "reported_max": self._number(raw.get("max_value")),
                    "reported_avg": self._number(raw.get("avg_value")),
                    "unit": None,
                    "unit_status": "unverified",
                }
            )

        stations = list(by_station.values())

        summary: Dict[str, Dict[str, Any]] = {}
        for station in stations:
            for row in station["pollutants"]:
                entry = summary.setdefault(
                    row["pollutant"],
                    {
                        "pollutant": row["pollutant"],
                        "rows": 0,
                        "stations_reporting": 0,
                        "unit": None,
                        "unit_status": "unverified",
                        "note": (
                            "The source response states neither a unit nor an averaging "
                            "window for this value."
                        ),
                    },
                )
                entry["rows"] += 1
                if any(
                    value is not None
                    for value in (row["reported_min"], row["reported_max"], row["reported_avg"])
                ):
                    entry["stations_reporting"] += 1

        pollutant_summary = sorted(summary.values(), key=lambda item: str(item["pollutant"]))

        source_total = payload.get("total")
        try:
            source_total_int = int(source_total) if source_total is not None else None
        except (TypeError, ValueError):
            source_total_int = None

        truncated = bool(source_total_int is not None and len(records) < source_total_int)
        return stations, skipped, pollutant_summary, source_total_int, truncated

    # ---------------------------------------------------------------- freshness
    def _timestamp_block(self, stations: List[Dict[str, Any]]) -> Dict[str, Any]:
        raws = sorted(
            {
                str(station.get("last_update_raw"))
                for station in stations
                if station.get("last_update_raw")
            }
        )
        parsed = [self._parse_last_update(raw) for raw in raws]
        parsed = [item for item in parsed if item is not None]
        latest = max(parsed) if parsed else None

        block: Dict[str, Any] = {
            "latest_raw": raws[-1] if raws else None,
            "distinct_values": raws[:6],
            "parsed_ist": latest.isoformat(timespec="seconds") if latest else None,
            "timezone_assumption": (
                "The source publishes bare wall-clock timestamps with no UTC offset. "
                "They are treated as Asia/Kolkata (IST) to estimate freshness only; "
                "this assumption is not stated by the provider."
            ),
        }

        if latest is None:
            block["freshness"] = {
                "status": "unknown",
                "age_hours": None,
                "stale_after_hours": settings.OBSERVATIONS_STALE_AFTER_HOURS,
                "note": "The observation timestamp could not be parsed, so freshness is unknown.",
            }
            return block

        age_hours = (datetime.now(IST) - latest).total_seconds() / 3600.0
        status = (
            "fresh"
            if age_hours <= settings.OBSERVATIONS_STALE_AFTER_HOURS
            else "stale"
        )
        block["freshness"] = {
            "status": status,
            "age_hours": round(age_hours, 2),
            "stale_after_hours": settings.OBSERVATIONS_STALE_AFTER_HOURS,
            "note": (
                "Age is computed from the latest reported station timestamp under the "
                "IST assumption above."
                if status == "fresh"
                else "The latest reported station timestamp is older than the freshness "
                "threshold; these values should not be presented as current conditions."
            ),
        }
        return block

    # -------------------------------------------------------------- base payload
    def _base(self, retrieved_at: str) -> Dict[str, Any]:
        return {
            "kind": "official_station_observations",
            "is_trained_model_output": False,
            "is_aqi": False,
            "label": (
                "Official CPCB/DPCC station pollutant concentrations published on "
                "data.gov.in — raw observations only, not an AQI"
            ),
            "city": settings.OBSERVATIONS_CITY,
            "provider": {
                "name": "data.gov.in (Open Government Data Platform India)",
                "publisher": "Central Pollution Control Board / Delhi Pollution Control Committee stations",
                "resource": RESOURCE_TITLE,
                "resource_id": RESOURCE_ID,
                "api_url": API_URL,
                "attribution": (
                    "Station pollutant records published by data.gov.in, Government of India, "
                    "originating from CPCB and DPCC monitoring stations."
                ),
                "credential_note": (
                    "Access uses a data.gov.in API key supplied through the "
                    "DATA_GOV_IN_API_KEY environment variable. The key is never returned "
                    "to a client or written to logs."
                ),
            },
            "retrieved_at": retrieved_at,
            "cached": False,
            "units": {
                "status": "unverified",
                "unit": None,
                "note": (
                    "The data.gov.in response has no unit or averaging-window field. "
                    "Values are shown exactly as published and are not claimed to be "
                    "comparable across stations, to any standard, or to an AQI."
                ),
            },
            "aqi": None,
            "aqi_note": (
                "No AQI is computed from this source. Its units and averaging window are "
                "unverified, and the trained model requires seven days of compatible "
                "derived-AQI history that does not exist for 2026."
            ),
        }

    def _unavailable(
        self,
        retrieved_at: str,
        status: str,
        message: str,
        reasons: List[str],
        missing_credential: bool = False,
    ) -> Dict[str, Any]:
        response = self._base(retrieved_at)
        response.update(
            {
                "status": status,
                "message": message,
                "reasons": reasons,
                "missing_credential": missing_credential,
                "station_count": 0,
                "record_count": 0,
                "skipped_records": 0,
                "source_total": None,
                "truncated": False,
                "pollutants": [],
                "stations": [],
                "observation_timestamp": None,
                "freshness": {
                    "status": "unknown",
                    "age_hours": None,
                    "stale_after_hours": settings.OBSERVATIONS_STALE_AFTER_HOURS,
                    "note": "No observations were returned.",
                },
            }
        )
        if missing_credential:
            response["setup"] = (
                "Set DATA_GOV_IN_API_KEY in the environment before starting the backend. "
                "Register a free key at https://www.data.gov.in/ and do not commit it."
            )
        return response

    # -------------------------------------------------------------------- public
    async def get_observations(self, use_cache: bool = True) -> Dict[str, Any]:
        retrieved_at = datetime.now(IST).isoformat(timespec="seconds")

        if not self.api_key:
            return self._unavailable(
                retrieved_at=retrieved_at,
                status="UNAVAILABLE",
                message="Live station observations are unavailable — no data.gov.in API key is configured.",
                reasons=[
                    "DATA_GOV_IN_API_KEY is empty or missing from the environment.",
                    "No request was sent, and no observation values are substituted.",
                ],
                missing_credential=True,
            )

        if (
            use_cache
            and self._cache is not None
            and (time.time() - self._cache_epoch) < settings.OBSERVATIONS_CACHE_TTL_SECONDS
        ):
            cached = self._build(self._cache, retrieved_at)
            cached["cached"] = True
            return cached

        try:
            payload = await self._fetch_records()
        except Exception as exc:  # transport, timeout, HTTP, JSON, shape
            reason = self._redact(str(exc)) or exc.__class__.__name__
            return self._unavailable(
                retrieved_at=retrieved_at,
                status="ERROR",
                message="Station observations could not be retrieved from data.gov.in.",
                reasons=[reason, "No observation values are substituted while the source is unreachable."],
            )

        self._cache = payload
        self._cache_epoch = time.time()
        return self._build(payload, retrieved_at)

    def _build(self, payload: Dict[str, Any], retrieved_at: str) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            return self._unavailable(
                retrieved_at=retrieved_at,
                status="UNAVAILABLE",
                message="The data.gov.in response could not be interpreted.",
                reasons=["The response was not a JSON object."],
            )
        try:
            stations, skipped, pollutants, source_total, truncated = self._normalise(payload)
        except ObservationsUpstreamError as exc:
            return self._unavailable(
                retrieved_at=retrieved_at,
                status="UNAVAILABLE",
                message="The data.gov.in response could not be interpreted.",
                reasons=[self._redact(str(exc))],
            )

        if not stations:
            return self._unavailable(
                retrieved_at=retrieved_at,
                status="UNAVAILABLE",
                message="No usable Delhi station records were present in the data.gov.in response.",
                reasons=[
                    f"{skipped} record(s) were rejected as missing required fields.",
                    "No observation values are substituted when the source returns nothing usable.",
                ],
            )

        timestamp_block = self._timestamp_block(stations)
        observation_count = sum(len(station["pollutants"]) for station in stations)

        response = self._base(retrieved_at)
        response.update(
            {
                "status": "OK",
                "message": (
                    "Reported station pollutant values as published by data.gov.in. "
                    "No AQI is derived and these values are not model inputs."
                ),
                "reasons": [],
                "station_count": len(stations),
                "record_count": observation_count,
                "skipped_records": skipped,
                "source_total": source_total,
                "truncated": truncated,
                "pollutants": pollutants,
                "stations": stations,
                "observation_timestamp": timestamp_block,
                "freshness": timestamp_block["freshness"],
                "provider_update_note": payload.get("updated_date"),
            }
        )

        if truncated:
            response["reasons"] = [
                (
                    f"The source reports {source_total} matching records but returned "
                    f"{observation_count}. Raise the API key's per-request limit or paginate "
                    "before treating this as a complete city snapshot."
                )
            ]
        return response


live_observations_service = LiveObservationsService()
