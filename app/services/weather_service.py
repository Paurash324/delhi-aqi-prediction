"""Live weather forecast service using Open-Meteo API with local caching and offline fallback."""
from __future__ import annotations
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

# Open-Meteo WMO weather code descriptions
WMO_WEATHER_CODES = {
    0: "Clear Sky",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing Rime Fog",
    51: "Light Drizzle",
    53: "Moderate Drizzle",
    55: "Dense Drizzle",
    61: "Slight Rain",
    63: "Moderate Rain",
    65: "Heavy Rain",
    71: "Slight Snow Fall",
    73: "Moderate Snow Fall",
    75: "Heavy Snow Fall",
    80: "Slight Rain Showers",
    81: "Moderate Rain Showers",
    82: "Violent Rain Showers",
    95: "Thunderstorm",
    96: "Thunderstorm with Slight Hail",
    99: "Thunderstorm with Heavy Hail"
}

class WeatherService:
    def __init__(self):
        self.api_url = "https://api.open-meteo.com/v1/forecast"
        self.cache_file = settings.WEATHER_CACHE_FILE
        self.cache_expiry = settings.CACHE_EXPIRY_SECONDS
        # Protect concurrent cold-start fetches from hammering Open-Meteo.
        self._fetch_lock: Any = None
        import asyncio as _asyncio

        class _LocalAsyncLock:
            def __init__(self) -> None:
                self._lock = _asyncio.Lock()

            async def acquire(self) -> None:
                await self._lock.acquire()

            def release(self) -> None:
                self._lock.release()

            async def __aenter__(self) -> Any:
                await self.acquire()
                return self

            async def __aexit__(self, *args: Any) -> None:
                self.release()

        self._LocalAsyncLock = _LocalAsyncLock
        # Expose for deterministic testing only.
        WeatherService._LocalAsyncLock = _LocalAsyncLock

    def _read_cache(self) -> Optional[Dict[str, Any]]:
        """Read cached weather response if valid."""
        if not self.cache_file.exists():
            return None
        try:
            data = json.loads(self.cache_file.read_text(encoding="utf-8"))
            cached_at = data.get("_cached_at_epoch", 0)
            if time.time() - cached_at < self.cache_expiry:
                data["cached"] = True
                return data
            # Even if expired, keep as fallback in case network fails
            data["_is_stale"] = True
            return data
        except Exception:
            return None

    def _write_cache(self, data: Dict[str, Any]):
        """Persist weather response to local cache."""
        try:
            data["_cached_at_epoch"] = time.time()
            data["_cached_at_iso"] = datetime.now(timezone.utc).isoformat()
            self.cache_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception:
            pass

    async def get_forecast(self) -> Dict[str, Any]:
        """Fetch weather forecast for Delhi, using Open-Meteo with caching."""
        cached = self._read_cache()
        if cached and not cached.get("_is_stale", False):
            data = dict(cached)
            data["cached"] = True
            return data

        params = {
            "latitude": settings.LATITUDE,
            "longitude": settings.LONGITUDE,
            "daily": "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,apparent_temperature_max,weather_code",
            # Feels-like, wind bearing and pressure are current-condition fields; the
            # daily block only reports the apparent-temperature maximum.
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,surface_pressure,weather_code",
            # One row per day in Asia/Kolkata: today plus the three forecast days
            # the dashboard shows. Without this the provider's default horizon is
            # used and the per-day series is not guaranteed to cover t+1..t+3.
            "forecast_days": 4,
            "timezone": settings.TIMEZONE,
        }

        try:
            async with self._LocalAsyncLock() as lock:
                # Re-read cache inside the lock so a concurrent cold start does not
                # cause multiple upstream fetches to run in parallel.
                cached = self._read_cache()
                if cached and not cached.get("_is_stale", False):
                    data = dict(cached)
                    data["cached"] = True
                    return data

                request_params = dict(params)
                logger.debug("Requesting Open-Meteo: url=%s params=%s", self.api_url, request_params)
                async with httpx.AsyncClient(timeout=8.0) as client:
                    res = await client.get(self.api_url, params=request_params)
                    logger.info(
                        "Open-Meteo upstream response: status=%s url=%s",
                        getattr(res, "status_code", None), self.api_url,
                    )
                    if res.status_code == 200:
                        raw = res.json()
                        parsed = self._parse_open_meteo_response(raw)
                        self._write_cache(parsed)
                        logger.info("Weather cache written successfully")
                        return parsed
                    # Non-200 response is an upstream failure - try to use cache if available
                    if cached:
                        cached_data = dict(cached)
                        cached_data["cached"] = True
                        cached_data["_is_stale"] = True
                        cached_data["warning"] = (
                            cached_data.get("warning")
                            or f"Upstream weather API returned HTTP {res.status_code}; serving cached forecast."
                        )
                        src = cached_data.get("source") or ""
                        if "stale" not in str(src).lower() and "cached" not in str(src).lower():
                            cached_data["source"] = f"Cached weather forecast (stale) - {src}".strip()
                        else:
                            cached_data["source"] = src
                        return cached_data
                    # No cache and upstream failed
                    logger.warning(
                        "No weather cache available and upstream returned HTTP %s; returning unavailable",
                        getattr(res, "status_code", None),
                    )
                    return self._offline_fallback()
        except Exception as exc:
            # Network failure or timeout: use stale cache if available
            logger.warning("Open-Meteo fetch failed: %s", exc, exc_info=False)
            if cached:
                cached_data = dict(cached)
                cached_data["cached"] = True
                cached_data["_is_stale"] = True
                cached_data["warning"] = (
                    cached_data.get("warning")
                    or "Network offline or slow; serving cached forecast."
                )
                src = cached_data.get("source") or ""
                if "stale" not in str(src).lower() and "cached" not in str(src).lower():
                    cached_data["source"] = f"Cached weather forecast (stale) - {src}".strip()
                else:
                    cached_data["source"] = src
                return cached_data

            # No cache exists and network/upstream failed
            logger.warning("No weather cache available and upstream fetch failed; returning unavailable")
            return self._offline_fallback()

    def _parse_open_meteo_response(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """Format Open-Meteo payload into structured weather view."""
        daily = raw.get("daily", {})
        current = raw.get("current", {})
        
        times = daily.get("time", [])
        max_temps = daily.get("temperature_2m_max", [])
        min_temps = daily.get("temperature_2m_min", [])
        rhs = daily.get("relative_humidity_2m_mean", [])
        precips = daily.get("precipitation_sum", [])
        winds = daily.get("wind_speed_10m_max", [])
        wind_dirs = daily.get("wind_direction_10m_dominant", [])
        feels = daily.get("apparent_temperature_max", [])
        codes = daily.get("weather_code", [])

        timeline = []
        for i in range(min(5, len(times))):
            wcode = codes[i] if i < len(codes) else 0
            timeline.append({
                "date": times[i],
                "temp_max": max_temps[i] if i < len(max_temps) else None,
                "temp_min": min_temps[i] if i < len(min_temps) else None,
                "humidity": rhs[i] if i < len(rhs) else None,
                "precipitation_mm": precips[i] if i < len(precips) else 0.0,
                "wind_speed_kmh": winds[i] if i < len(winds) else None,
                "wind_direction_deg": wind_dirs[i] if i < len(wind_dirs) else None,
                "feels_like_max": feels[i] if i < len(feels) else None,
                "weather_code": wcode,
                "weather_desc": WMO_WEATHER_CODES.get(wcode, "Clear")
            })

        # Tomorrow is index 1 if present
        tomorrow = timeline[1] if len(timeline) > 1 else (timeline[0] if timeline else {})

        curr_code = current.get("weather_code", 0)
        curr_obj = {
            "temperature_c": current.get("temperature_2m"),
            "humidity_pct": current.get("relative_humidity_2m"),
            "wind_speed_kmh": current.get("wind_speed_10m"),
            "wind_direction_deg": current.get("wind_direction_10m"),
            "feels_like_c": current.get("apparent_temperature"),
            "pressure_hpa": current.get("surface_pressure"),
            "weather_code": curr_code,
            "weather_desc": WMO_WEATHER_CODES.get(curr_code, "Clear")
        }

        return {
            "success": True,
            "source": "Open-Meteo Weather Forecast (Asia/Kolkata)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "city": settings.CITY_NAME,
            "current": curr_obj,
            "tomorrow_forecast": tomorrow,
            "daily_timeline": timeline,
            "cached": False,
            "warning": None
        }

    def _offline_fallback(self) -> Dict[str, Any]:
        """Return unavailable weather state without fabricating forecast values."""
        now = datetime.now(timezone.utc)
        return {
            "success": False,
            "available": False,
            "status": "unavailable",
            "source": "Weather forecast unavailable",
            "timestamp": now.isoformat(),
            "city": settings.CITY_NAME,
            "current": None,
            "tomorrow_forecast": {},
            "daily_timeline": [],
            "cached": False,
            "warning": "Live weather forecast unavailable. No cached data found."
        }

weather_service = WeatherService()
