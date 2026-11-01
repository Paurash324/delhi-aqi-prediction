"""External (third-party) modelled AQI forecast endpoint.

This router is intentionally separate from /api/predict and /api/live/status so an
external, concentration-derived estimate can never be mistaken for output of the
project's trained Gradient Boosting bundle.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.services.external_aqi_service import external_aqi_service

router = APIRouter(prefix="/api/live", tags=["External Forecast (Open-Meteo CAMS)"])


@router.get("/external-aqi-forecast")
async def get_external_aqi_forecast():
    """Next-day modelled AQI estimate computed from CAMS forecast concentrations.

    Returns status OK, UNAVAILABLE, or ERROR. An OK response carries
    `experimental: true` and `cpcb_compliant: false` whenever the source's native
    resolution cannot satisfy CPCB's data-sufficiency rules (always the case for the
    3-hourly CAMS Global field). It never falls back to a US AQI value as an
    Indian-scale index, and it never uses archived observations as a forecast.
    """
    return await external_aqi_service.get_next_day_forecast()


@router.get("/external-aqi-outlook")
async def get_external_aqi_outlook():
    """Four-day modelled outlook: today's bulletin window plus the next three days.

    Each day is a separate 24-hour CPCB convention window (ending 16:00 IST) computed
    from the same CAMS fetch, so the days are independent estimates rather than a
    running mean. Day 0 is the *current* window and is labelled `current_estimate`; it
    is still a modelled value, never an observed CPCB AQI and never a model output.
    """
    return await external_aqi_service.get_outlook(days=4)
