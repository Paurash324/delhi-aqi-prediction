"""API routes for Live Weather Forecast, Live AQI Compatibility, and Inference."""
from __future__ import annotations
from typing import Optional, Dict, Any, List
import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field
from app.services.weather_service import weather_service
from app.services.aqi_data_provider import aqi_provider
from app.services.prediction_service import prediction_service
from app.services.live_observations_service import live_observations_service
from app.services.demo_simulation_service import (
    SIMULATED_INPUT_REJECTION,
    contains_simulated_records,
)
from app.config import settings

router = APIRouter(prefix="/api", tags=["Live Services & Prediction"])

class PredictRequest(BaseModel):
    target_date: str = Field(..., description="Desired target forecast date in YYYY-MM-DD format")
    horizon_days: int = Field(1, ge=1, le=3, description="Forecast horizon in days (1, 2, or 3)")
    custom_history: Optional[List[Dict[str, Any]]] = Field(
        None, 
        description="Optional list of daily feature rows through forecast origin if providing refreshed 2026 data"
    )

@router.get("/live/weather")
async def get_live_weather():
    """Fetch live weather forecast for Delhi using Open-Meteo."""
    return await weather_service.get_forecast()

@router.get("/live/observations")
async def get_live_observations():
    """Reported CPCB/DPCC station pollutant values from data.gov.in.

    Raw observations only: no AQI is derived from them, they are not inputs to the
    trained model, and their units/averaging window are flagged as unverified.
    """
    return await live_observations_service.get_observations()


@router.get("/live/status")
def get_live_aqi_status():
    """Check whether compatible live pollution inputs are present for 2026 forecasting.

    The loaded bundle's own metadata is attached so the UI labels each horizon with the
    estimator actually in the artifact (GradientBoosting / RandomForest / persistence)
    instead of a hard-coded string.
    """
    status = aqi_provider.check_live_compatibility()
    status["model_bundle"] = prediction_service.get_bundle_info()
    return status

@router.post("/predict")
def predict_endpoint(payload: PredictRequest):
    """Validate forecast request and execute inference if compatible inputs exist.
    
    Enforces the honest model contract:
    - Target dates require compatible daily history up to forecast origin.
    - If 2026 date is requested without compatible refreshed ground-station history,
      it returns 'AQI forecast unavailable — compatible recent pollution data not available.'
    """
    date = payload.target_date
    horizon = payload.horizon_days

    # Date format validation
    if len(date) != 10 or date[4] != "-" or date[7] != "-":
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")

    # If custom refreshed history is provided
    if payload.custom_history:
        # Demo Simulation records are fabricated sample data and must never reach
        # the trained model, even if a client submits them as custom history.
        if contains_simulated_records(payload.custom_history):
            return {
                "success": False,
                "status": "REJECTED",
                "message": "Simulated demo records cannot be used for prediction.",
                "detail": SIMULATED_INPUT_REJECTION,
                "target_date": date,
                "horizon_days": horizon,
            }
        try:
            df_hist = pd.DataFrame(payload.custom_history)
            res = prediction_service.predict(df_hist, horizon)
            return {"success": True, "result": res}
        except Exception as e:
            return {
                "success": False,
                "error": "Inference failed on provided history.",
                "message": str(e)
            }

    # If no custom history was passed and date is in 2026 or later
    if date >= "2026-01-01":
        return {
            "success": False,
            "status": "UNAVAILABLE",
            "message": "AQI forecast unavailable — compatible recent pollution data not available.",
            "detail": (
                "The trained ML model bundle was trained on ground-station records ending 2025-12-31. "
                "Forecasting future 2026 dates requires continuous 7-day lagged CPCB ground-monitor "
                "features and daily derived AQI up to the origin date. Faking predictions or substituting "
                "foreign AQI indices is disallowed by the model contract."
            ),
            "target_date": date,
            "horizon_days": horizon,
            "target_label": "CPCB-method-derived citywide daily AQI estimate (not an official CPCB bulletin value)"
        }

    # If date is within the frozen 2024-2025 dataset
    if settings.DAILY_HISTORY_FILE.exists():
        df_full = pd.read_csv(settings.DAILY_HISTORY_FILE)
        df_full["date"] = pd.to_datetime(df_full["date"]).dt.strftime("%Y-%m-%d")
        
        target_ts = pd.to_datetime(date)
        origin_date = (target_ts - pd.Timedelta(days=horizon)).strftime("%Y-%m-%d")
        
        sub = df_full[df_full["date"] <= origin_date].copy()
        if len(sub) >= 7:
            try:
                res = prediction_service.predict(sub, horizon)
                return {"success": True, "result": res}
            except Exception as e:
                return {"success": False, "error": "Inference error", "message": str(e)}

    return {
        "success": False,
        "message": f"Historical origin data for {date} with horizon {horizon} could not be resolved."
    }
