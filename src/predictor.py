"""Inference helper for the Delhi CPCB-method-derived AQI prototype.

This bundle predicts a derived citywide daily mean of hourly station AQI values,
not an official CPCB-issued daily bulletin number. The user must supply recent
compatible daily history through the forecast origin date.
"""
from __future__ import annotations
from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd

PACKAGE_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = PACKAGE_DIR / "models"
BUNDLE_PATH = MODEL_DIR / "delhi_citywide_aqi_models.joblib"


def load_bundle(path: str | Path = BUNDLE_PATH):
    """Load trained models and their feature specification."""
    return joblib.load(path)


def _feature_row(history: pd.DataFrame, horizon: int, feature_columns: list[str]) -> pd.DataFrame:
    """Build a single inference row from daily history through the forecast origin.

    Required columns: date, daily_mean_hourly_city_aqi, plus the daily pollutant/weather
    variables used in training. Only values available up to the latest row are used.
    """
    if history.empty:
        raise ValueError("No history rows were provided.")
    h = history.copy()
    h["date"] = pd.to_datetime(h["date"], errors="coerce")
    h = h.dropna(subset=["date"]).sort_values("date").drop_duplicates("date", keep="last")
    if h.empty:
        raise ValueError("No valid dates were found in the history.")
    target_col = "daily_mean_hourly_city_aqi"
    if target_col not in h.columns:
        raise ValueError(f"History must include '{target_col}'.")
    row = h.iloc[-1]
    origin_date = row["date"]
    result: dict[str, float] = {}
    result["aqi_today"] = row[target_col]
    y = h.set_index("date")[target_col]
    for lag in [1, 2, 3, 7]:
        lag_date = origin_date - pd.Timedelta(days=lag)
        result[f"aqi_lag{lag}"] = y.get(lag_date, np.nan)
    window = h[h["date"].between(origin_date - pd.Timedelta(days=6), origin_date)]
    result["aqi_roll7"] = window[target_col].mean() if window[target_col].notna().sum() == 7 else np.nan
    target_date = origin_date + pd.Timedelta(days=horizon)
    doy = target_date.dayofyear
    result["target_month"] = target_date.month
    result["target_dayofweek"] = target_date.dayofweek
    result["target_sin_dayyear"] = np.sin(2 * np.pi * doy / 365.25)
    result["target_cos_dayyear"] = np.cos(2 * np.pi * doy / 365.25)
    for col in feature_columns:
        if col in result:
            continue
        result[col] = row[col] if col in h.columns else np.nan
    return pd.DataFrame([{c: result.get(c, np.nan) for c in feature_columns}])


def predict_horizon(history: pd.DataFrame, horizon: int, bundle=None) -> dict:
    """Predict one or two days ahead, or use persistence fallback for day three.

    history should be updated from a compatible recent data source. Daily columns
    must follow the exact aggregation/units used during training.
    """
    if horizon not in (1, 2, 3):
        raise ValueError("Supported forecast horizons are 1, 2, or 3 days.")
    bundle = bundle or load_bundle()
    h = history.copy()
    h["date"] = pd.to_datetime(h["date"], errors="coerce")
    h = h.dropna(subset=["date"]).sort_values("date").drop_duplicates("date", keep="last")
    if h.empty:
        raise ValueError("No valid history rows were provided.")
    origin = h.iloc[-1]
    last_known = origin.get("daily_mean_hourly_city_aqi", np.nan)
    if pd.isna(last_known):
        raise ValueError("Latest history row has no AQI target; cannot forecast safely.")
    target_date = pd.Timestamp(origin["date"]) + pd.Timedelta(days=horizon)
    if horizon == 3 or horizon not in bundle.get("models", {}):
        return {"date": target_date.date().isoformat(), "horizon_days": horizon,
                "predicted_aqi": float(last_known), "method": "persistence_fallback",
                "label": "Fallback estimate: latest known AQI", "model_confidence": "low"}
    spec = bundle["models"][horizon]
    x = _feature_row(h, horizon, spec["feature_columns"])
    pred = float(spec["pipeline"].predict(x)[0])
    pred = max(0.0, min(500.0, pred))
    return {"date": target_date.date().isoformat(), "horizon_days": horizon,
            "predicted_aqi": pred, "method": spec["model_name"],
            "label": "CPCB-method-derived AQI estimate", "model_confidence": "provisional"}
