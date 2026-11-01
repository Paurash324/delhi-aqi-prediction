"""Deterministic synthetic station observations for Demo Simulation mode.

Integrity rules
---------------
* These records are fabricated for interface demonstration only. They are not
  observations, do not originate from CPCB/DPCC or data.gov.in, and are never
  presented as current conditions.
* Every figure here is fixed in this module: no randomness, no clock reads, so
  repeated calls return byte-identical readings.
* No AQI is calculated from these values. Each record carries ``aqi=None``,
  ``is_aqi=False`` and ``is_trained_model_output=False``.
* The live-observations service never imports this module and this module never
  writes to the live response. ``contains_simulated_records`` is the one-way
  guard used by the prediction path to reject simulated rows.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Sequence, Tuple

# Fictitious zone names. Deliberately not real CPCB/DPCC monitoring stations.
DEMO_STATION_NAMES: Tuple[str, ...] = (
    "Demo North",
    "Demo Central",
    "Demo East",
    "Demo South",
    "Demo West",
    "Demo NCR",
    "Demo North-West",
    "Demo South-East",
)

DEMO_NOTICE = "SIMULATED DEMO DATA — NOT LIVE — NOT OFFICIAL CPCB AQI"

# Pollutant -> illustrative unit. CO is shown in mg/m³, the rest in µg/m³, which
# is the common CPCB reporting convention. These units are illustrative only:
# no averaging window or calibration basis is claimed.
POLLUTANTS: Tuple[Tuple[str, str], ...] = (
    ("PM2.5", "µg/m³"),
    ("PM10", "µg/m³"),
    ("NO2", "µg/m³"),
    ("SO2", "µg/m³"),
    ("CO", "mg/m³"),
    ("O3", "µg/m³"),
    ("NH3", "µg/m³"),
)

# (station, per-pollutant readings in POLLUTANTS order, reading offset minutes)
# The readings are plausible Delhi winter concentrations, hand-set so the demo
# looks realistic without ever implying a measurement.
_SNAPSHOT_DATE_LABEL = "15 Jan 2026, 08:00 IST"
_SNAPSHOT_ISO = "2026-01-15T08:00:00+05:30"

_STATION_READINGS: Tuple[Tuple[str, Sequence[float], int], ...] = (
    ("Demo North", (96.4, 178.2, 41.6, 12.3, 1.12, 44.8, 18.5), 0),
    ("Demo Central", (118.7, 204.9, 52.1, 15.8, 1.46, 38.2, 22.1), 7),
    ("Demo East", (142.3, 236.5, 47.9, 18.4, 1.71, 31.7, 26.4), 14),
    ("Demo South", (88.1, 164.8, 36.2, 10.6, 0.94, 49.3, 15.9), 21),
    ("Demo West", (131.6, 221.4, 44.3, 16.9, 1.58, 35.1, 24.7), 28),
    ("Demo NCR", (154.2, 258.7, 58.4, 21.2, 1.93, 28.6, 29.8), 35),
    ("Demo North-West", (104.9, 189.3, 39.8, 13.7, 1.21, 42.4, 19.6), 42),
    ("Demo South-East", (122.5, 213.6, 46.1, 17.3, 1.49, 33.9, 23.2), 49),
)

# Markers that identify simulated rows if they are ever handed to a
# non-simulation consumer (for example the prediction endpoint).
SIMULATION_FLAG_FIELDS: Tuple[str, ...] = ("is_simulated", "is_demo", "simulated", "demo")
SIMULATION_KIND_VALUES = frozenset({"simulated_demo_observations", "demo_simulation"})
SIMULATION_STATION_FIELD = "station"
SIMULATION_SOURCE_FIELD = "data_origin"


def _offset_label(minutes: int) -> str:
    hour = 8 + minutes // 60
    minute = minutes % 60
    return f"15 Jan 2026, {hour:02d}:{minute:02d} IST"


def _station_record(
    name: str, values: Sequence[float], offset_minutes: int
) -> Dict[str, Any]:
    return {
        "station": name,
        "zone_label": f"Fictitious demo zone · {name}",
        # AQI fields stay null/false on every simulated record.
        "aqi": None,
        "is_aqi": False,
        "is_trained_model_output": False,
        "is_simulated": True,
        "data_origin": "demo_simulation",
        "illustrative_timestamp": _SNAPSHOT_ISO,
        "illustrative_timestamp_label": _offset_label(offset_minutes),
        "readings": [
            {
                "pollutant": pollutant,
                "value": value,
                "unit": unit,
                "unit_status": "illustrative_only",
                "aqi": None,
                "is_aqi": False,
                "is_trained_model_output": False,
            }
            for (pollutant, unit), value in zip(POLLUTANTS, values)
        ],
    }


class DemoSimulationService:
    """Builds the deterministic Demo Simulation payload.

    Deliberately synchronous and self-contained: it performs no I/O, reads no
    clock, and cannot be influenced by the live-observations cache or provider.
    """

    def build_payload(self) -> Dict[str, Any]:
        stations = [
            _station_record(name, values, offset)
            for name, values, offset in _STATION_READINGS
        ]
        record_count = sum(len(station["readings"]) for station in stations)

        pollutants = [
            {
                "pollutant": pollutant,
                "unit": unit,
                "unit_status": "illustrative_only",
                "stations_reporting": len(stations),
                "note": (
                    "Synthetic value. The unit is illustrative only; no averaging "
                    "window, calibration basis or standard comparison is claimed."
                ),
            }
            for pollutant, unit in POLLUTANTS
        ]

        return {
            "status": "DEMO",
            "kind": "simulated_demo_observations",
            "is_simulated": True,
            "is_trained_model_output": False,
            "is_aqi": False,
            "aqi": None,
            "label": (
                "Simulated demo station readings — fabricated sample records for "
                "interface demonstration only"
            ),
            "notice": DEMO_NOTICE,
            "disclaimer": (
                "These are fabricated sample records created to demonstrate the "
                "station-observations interface. They are not observations, do not "
                "come from CPCB, DPCC or data.gov.in, and are not current conditions."
            ),
            "demo_note": (
                "Demo Simulation uses fabricated sample records to demonstrate this "
                "interface. Nothing here is measured, and switching modes does not "
                "change the live observations response."
            ),
            "unit_notice": (
                "Units are illustrative only: they follow common reporting "
                "conventions to keep the table readable and are not verified "
                "against any monitoring standard."
            ),
            "aqi_note": (
                "No AQI is calculated or claimed from these synthetic values. "
                "Official CPCB AQI requires measured sub-indices over a valid "
                "averaging window, none of which exists in this fixture."
            ),
            "city": "Delhi (fictitious demo zones)",
            "sample_snapshot": {
                "label": _SNAPSHOT_DATE_LABEL,
                "iso": _SNAPSHOT_ISO,
                "is_illustrative": True,
                "note": (
                    "Fixed illustrative timestamp used so repeated demo loads show "
                    "identical records. It is not the current time and not a "
                    "reported observation time."
                ),
            },
            "station_count": len(stations),
            "record_count": record_count,
            "pollutants": pollutants,
            "stations": stations,
            "provenance": {
                "source": "Bundled deterministic fixture (app/services/demo_simulation_service.py)",
                "real_station_names": False,
                "may_feed_model": False,
                "may_report_aqi": False,
                "excluded_from": [
                    "GET /api/live/observations",
                    "POST /api/predict",
                    "trained-model inference",
                ],
            },
        }


demo_simulation_service = DemoSimulationService()


# --------------------------------------------------------------------- guard
def _is_truthy(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    # NumPy scalars (np.bool_, np.int64, …) expose .item().
    item = getattr(value, "item", None)
    if callable(item):
        try:
            value = item()
        except Exception:  # pragma: no cover - defensive only
            return False
        if isinstance(value, bool):
            return value
    if isinstance(value, (int, float)):
        # NaN must not count as a simulation flag.
        return value == value and value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "y", "simulated", "demo"}
    return False


def _row_is_simulated(row: Dict[str, Any]) -> bool:
    if not isinstance(row, dict):
        return False
    for field in SIMULATION_FLAG_FIELDS:
        if field in row and _is_truthy(row[field]):
            return True
    kind = row.get("kind")
    if isinstance(kind, str) and kind.strip().lower() in SIMULATION_KIND_VALUES:
        return True
    origin = row.get(SIMULATION_SOURCE_FIELD)
    if isinstance(origin, str) and origin.strip().lower() in {"demo", "simulation", "demo_simulation"}:
        return True
    source = row.get("source")
    if isinstance(source, str) and source.strip().lower() in SIMULATION_KIND_VALUES:
        return True
    station = row.get(SIMULATION_STATION_FIELD)
    if isinstance(station, str) and station.strip() in DEMO_STATION_NAMES:
        return True
    # Nested station objects copied from a demo payload.
    nested = row.get("stations")
    if isinstance(nested, (list, tuple)) and any(_row_is_simulated(item) for item in nested):
        return True
    return False


def contains_simulated_records(records: Any) -> bool:
    """True when ``records`` carries any Demo Simulation marker.

    Accepts a pandas DataFrame (columns) or an iterable of dict rows, so both
    the HTTP request body and the prediction service's DataFrame input can be
    screened with the same rule.
    """
    if records is None:
        return False
    if isinstance(records, dict):
        # A whole payload object (top-level markers plus a stations list).
        return _row_is_simulated(records)

    columns = getattr(records, "columns", None)
    if columns is not None:
        lowered = {str(column).strip().lower(): column for column in columns}
        for field in SIMULATION_FLAG_FIELDS:
            column = lowered.get(field)
            if column is not None and records[column].map(_is_truthy).any():
                return True
        for field in ("kind", SIMULATION_SOURCE_FIELD, "source"):
            column = lowered.get(field)
            if column is not None:
                values = {
                    str(value).strip().lower()
                    for value in records[column].dropna().unique().tolist()
                }
                if values & SIMULATION_KIND_VALUES:
                    return True
                if field == SIMULATION_SOURCE_FIELD and values & {"demo", "simulation", "demo_simulation"}:
                    return True
        station_column = lowered.get(SIMULATION_STATION_FIELD)
        if station_column is not None:
            names = {str(value).strip() for value in records[station_column].dropna().unique().tolist()}
            if names & set(DEMO_STATION_NAMES):
                return True
        return False

    if isinstance(records, (str, bytes)):
        return False
    if isinstance(records, Iterable):
        for row in records:
            if isinstance(row, dict) and _row_is_simulated(row):
                return True
    return False


SIMULATED_INPUT_REJECTION = (
    "Simulated demo records cannot be used for prediction. Demo Simulation data "
    "is fabricated for interface demonstration only and is never a model input."
)


class SimulatedInputError(ValueError):
    """Raised when simulated demo rows reach a non-simulation consumer."""


def assert_no_simulated_records(records: Any) -> None:
    """Raise ``SimulatedInputError`` if any simulated marker is present."""
    if contains_simulated_records(records):
        raise SimulatedInputError(SIMULATED_INPUT_REJECTION)


def demo_records(records: List[Dict[str, Any]] | None = None) -> List[Dict[str, Any]]:
    """Convenience helper returning the simulated station records as flat rows."""
    payload = records if records is not None else demo_simulation_service.build_payload()["stations"]
    rows: List[Dict[str, Any]] = []
    for station in payload:
        for reading in station.get("readings", []):
            rows.append(
                {
                    "station": station.get("station"),
                    "pollutant": reading.get("pollutant"),
                    "value": reading.get("value"),
                    "unit": reading.get("unit"),
                    "is_simulated": True,
                    "data_origin": "demo_simulation",
                    "aqi": None,
                }
            )
    return rows
