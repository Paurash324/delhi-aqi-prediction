"""API route for Demo Simulation station observations.

Kept on its own path so the live-observations response can never be replaced by
synthetic data. Nothing here reads the live cache or the data.gov.in credential.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.services.demo_simulation_service import demo_simulation_service

router = APIRouter(prefix="/api", tags=["Demo Simulation"])


@router.get("/demo/observations")
def get_demo_observations():
    """Fabricated, deterministic station records for interface demonstration.

    The payload is explicitly marked simulated: ``is_simulated=True``,
    ``is_aqi=False``, ``is_trained_model_output=False`` and ``aqi=None`` on every
    record. These values are never returned by ``/api/live/observations`` and are
    rejected by the prediction endpoint.
    """
    return demo_simulation_service.build_payload()
