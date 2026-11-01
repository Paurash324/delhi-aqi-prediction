"""API routes for Historical Replay Mode and model evaluation reports."""
from __future__ import annotations
import json
import pandas as pd
from fastapi import APIRouter, Query, HTTPException
from app.config import settings
from app.services.replay_service import replay_service

router = APIRouter(prefix="/api/replay", tags=["Historical Replay"])

@router.get("/range")
def get_replay_range():
    """Return available dates and boundaries for held-out replay."""
    return replay_service.get_available_date_range()

@router.get("/episodes")
def get_replay_episodes():
    """Return notable episodes for demonstration."""
    return replay_service.get_notable_episodes()

@router.get("/query")
def query_replay_date(
    date: str = Query(..., description="Target date in YYYY-MM-DD format"),
    horizon: int = Query(1, ge=1, le=3, description="Forecast horizon in days (1, 2, or 3)")
):
    """Query held-out model predictions, target, baseline, and errors for a date."""
    # Basic format check
    if len(date) != 10 or date[4] != "-" or date[7] != "-":
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")
    
    res = replay_service.query_replay(target_date=date, horizon_days=horizon)
    return res

@router.get("/metrics")
def get_model_evaluation_metrics():
    """Return frozen metrics and limitations for viva presentation."""
    metrics_list = []
    if settings.MODEL_METRICS_FILE.exists():
        df_met = pd.read_csv(settings.MODEL_METRICS_FILE)
        metrics_list = df_met.to_dict(orient="records")
    
    metadata = {}
    if settings.MODEL_METADATA_FILE.exists():
        try:
            metadata = json.loads(settings.MODEL_METADATA_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass

    return {
        "metrics": metrics_list,
        "metadata": metadata,
        "summary": {
            "1_day": {"model": "GradientBoosting", "test_MAE": 15.78, "baseline_MAE": 21.50, "verdict": "Beats persistence baseline"},
            "2_day": {"model": "RandomForest", "test_MAE": 29.03, "baseline_MAE": 30.72, "verdict": "Marginal improvement over baseline"},
            "3_day": {"model": "HistGradientBoosting", "test_MAE": 39.10, "baseline_MAE": 33.43, "verdict": "Worse than baseline; persistence fallback used"}
        }
    }
