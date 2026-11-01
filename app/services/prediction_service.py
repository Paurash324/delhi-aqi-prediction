"""Prediction service wrapping the trained models and persistence fallback."""
from __future__ import annotations
from typing import Dict, Any, Optional
import pandas as pd
from app.config import settings
from app.services.demo_simulation_service import assert_no_simulated_records
from src.predictor import load_bundle, predict_horizon

class PredictionService:
    def __init__(self):
        self._bundle = None
        self._load_bundle_safe()

    def _load_bundle_safe(self):
        try:
            if settings.MODEL_BUNDLE_FILE.exists():
                self._bundle = load_bundle(settings.MODEL_BUNDLE_FILE)
        except Exception as e:
            self._bundle = None

    def is_model_loaded(self) -> bool:
        return self._bundle is not None

    def get_bundle_info(self) -> Dict[str, Any]:
        if not self._bundle:
            return {"loaded": False}
        return {
            "loaded": True,
            "target_label": self._bundle.get("target_label"),
            "target_name": self._bundle.get("target_name"),
            "data_end": self._bundle.get("data_end"),
            "timezone": self._bundle.get("timezone"),
            "models": {
                h: {
                    "model_name": spec.get("model_name"),
                    "test_MAE": round(spec.get("test_MAE", 0), 2),
                    "test_baseline_MAE": round(spec.get("test_baseline_MAE", 0), 2)
                } for h, spec in self._bundle.get("models", {}).items()
            },
            "note": self._bundle.get("note")
        }

    def predict(self, history: pd.DataFrame, horizon: int) -> Dict[str, Any]:
        """Execute inference using the frozen model bundle.

        Simulated demo rows are rejected before any feature work so fabricated
        sample data can never become a model input.
        """
        assert_no_simulated_records(history)
        if not self._bundle:
            raise RuntimeError("Model bundle is not loaded.")
        return predict_horizon(history, horizon, bundle=self._bundle)

prediction_service = PredictionService()
