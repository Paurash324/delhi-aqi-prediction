"""Unit tests for the Historical Replay Service."""
import pytest
from app.services.replay_service import replay_service, get_cpcb_category

def test_cpcb_categories():
    assert get_cpcb_category(35)[0] == "Good"
    assert get_cpcb_category(75)[0] == "Satisfactory"
    assert get_cpcb_category(150)[0] == "Moderate"
    assert get_cpcb_category(250)[0] == "Poor"
    assert get_cpcb_category(350)[0] == "Very Poor"
    assert get_cpcb_category(450)[0] == "Severe"

def test_replay_date_range():
    r = replay_service.get_available_date_range()
    assert "test_range" in r
    assert r["test_range"]["min"] == "2025-07-01"
    assert r["test_range"]["max"] == "2025-12-31"
    assert r["test_range"]["count"] == 184

def test_replay_valid_date():
    res = replay_service.query_replay("2025-11-12", horizon_days=1)
    assert res["success"] is True
    assert res["target_date"] == "2025-11-12"
    assert res["horizon_days"] == 1
    assert res["selected_model"] == "GradientBoosting"
    assert res["predicted_aqi"] is not None
    assert res["actual_aqi_estimate"] is not None
    assert res["persistence_prediction"] is not None
    assert res["absolute_model_error"] is not None
    assert len(res["pollutants"]) > 0
    assert "chart_series" in res
    assert len(res["chart_series"]["dates"]) > 0

def test_replay_horizon_2():
    res = replay_service.query_replay("2025-11-12", horizon_days=2)
    assert res["success"] is True
    assert res["selected_model"] == "RandomForest"

def test_replay_horizon_3():
    res = replay_service.query_replay("2025-11-12", horizon_days=3)
    assert res["success"] is True
    assert res["selected_model"] == "HistGradientBoosting"

def test_replay_training_date_handled():
    # 2024 is in the training set
    res = replay_service.query_replay("2024-05-15", horizon_days=1)
    assert res["success"] is False
    assert "training" in res["message"].lower()

def test_replay_unsupported_horizon():
    res = replay_service.query_replay("2025-11-12", horizon_days=4)
    assert res["success"] is False
    assert "unsupported horizon" in res["message"].lower()

def test_replay_future_date():
    res = replay_service.query_replay("2026-10-25", horizon_days=1)
    assert res["success"] is False
    assert "live forecast mode" in res["message"].lower()
