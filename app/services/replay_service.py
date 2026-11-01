"""Historical Replay Service for held-out 2025 evaluation data and daily history."""
from __future__ import annotations
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
from app.config import settings
from app.models_schema import PollutantDetail, WeatherDetail

# Episode markers. Only the date and framing live here; the AQI shown for each
# marker is resolved from the replay dataset in `_episode_aqi`.
EPISODE_MARKERS: List[Dict[str, str]] = [
    {
        "id": "monsoon_clean",
        "date": "2025-07-16",
        "title": "Monsoon Clean Air",
        "tag": "Good / Low AQI",
        "description": "Heavy monsoon precipitation washes out PM2.5, resulting in clear conditions.",
    },
    {
        "id": "autumn_onset",
        "date": "2025-09-22",
        "title": "Autumn Transition",
        "tag": "Satisfactory",
        "description": "Moderate wind speeds and lower humidity prior to winter inversion onset.",
    },
    {
        "id": "october_deterioration",
        "date": "2025-10-25",
        "title": "Early Winter Smog",
        "tag": "Poor",
        "description": "Falling surface temperatures and reduced planetary boundary layer height.",
    },
    {
        "id": "november_peak",
        "date": "2025-11-12",
        "title": "Peak Severe Episode",
        "tag": "Severe",
        "description": "Atmospheric stagnation combined with seasonal biomass burning and calm winds.",
    },
    {
        "id": "december_inversion",
        "date": "2025-12-24",
        "title": "Winter Inversion Event",
        "tag": "Very Poor",
        "description": "Dense cold air trapping surface emissions and elevated PM2.5 concentrations.",
    },
]

def get_cpcb_category(aqi: float) -> tuple[str, str, str]:
    """Return CPCB category, CSS theme token, and health statement for an AQI value."""
    if aqi <= 50:
        return "Good", "cpcb-good", "Minimal health impact. Air quality is considered satisfactory."
    elif aqi <= 100:
        return "Satisfactory", "cpcb-satisfactory", "Minor breathing discomfort to sensitive people."
    elif aqi <= 200:
        return "Moderate", "cpcb-moderate", "Breathing discomfort to people with asthma, lungs, and heart diseases."
    elif aqi <= 300:
        return "Poor", "cpcb-poor", "Breathing discomfort to most people on prolonged exposure."
    elif aqi <= 400:
        return "Very Poor", "cpcb-very-poor", "Respiratory illness to the people on prolonged exposure."
    else:
        return "Severe", "cpcb-severe", "Affects healthy people and seriously impacts those with existing diseases."

class ReplayService:
    def __init__(self):
        self._test_preds_df: Optional[pd.DataFrame] = None
        self._daily_history_df: Optional[pd.DataFrame] = None
        self._load_data()

    def _load_data(self):
        """Load frozen evaluation predictions and daily historical features."""
        if settings.TEST_PREDICTIONS_FILE.exists():
            df = pd.read_csv(settings.TEST_PREDICTIONS_FILE)
            df["target_date"] = pd.to_datetime(df["target_date"]).dt.strftime("%Y-%m-%d")
            self._test_preds_df = df
        
        if settings.DAILY_HISTORY_FILE.exists():
            df_hist = pd.read_csv(settings.DAILY_HISTORY_FILE)
            df_hist["date"] = pd.to_datetime(df_hist["date"]).dt.strftime("%Y-%m-%d")
            self._daily_history_df = df_hist

    def get_available_date_range(self) -> Dict[str, Any]:
        """Return available dates and boundaries for held-out replay and daily history."""
        test_dates = sorted(self._test_preds_df["target_date"].unique().tolist()) if self._test_preds_df is not None else []
        hist_dates = sorted(self._daily_history_df["date"].unique().tolist()) if self._daily_history_df is not None else []
        
        return {
            "test_range": {
                "min": test_dates[0] if test_dates else None,
                "max": test_dates[-1] if test_dates else None,
                "count": len(test_dates),
                "split": "2025 H2 Held-out Final Test Split"
            },
            "archive_range": {
                "min": hist_dates[0] if hist_dates else None,
                "max": hist_dates[-1] if hist_dates else None,
                "count": len(hist_dates)
            },
            "default_date": "2025-11-12",  # Typical severe episode to demonstrate capability
            "supported_horizons": [1, 2, 3]
        }

    def _episode_aqi(self, date_str: str) -> tuple[Optional[float], Optional[str]]:
        """Resolve the AQI for an episode marker from the same series replay reports.

        The marker's value must be the frozen 2025 H2 target for that date, because that
        is the number /api/replay/query shows as `actual_aqi_estimate` for the same day.
        The previous hand-written constants (e.g. 420 for 2025-11-12 while the frozen
        target was 459.5) made the episode list look like a different measurement of a
        different quantity.
        """
        if self._test_preds_df is not None:
            rows = self._test_preds_df[
                (self._test_preds_df["target_date"] == date_str) &
                (self._test_preds_df["horizon_days"] == 1)
            ]
            if not rows.empty:
                return round(float(rows.iloc[0]["actual_aqi_estimate"]), 1), "frozen_target_2025_H2"
        if self._daily_history_df is not None and "daily_mean_hourly_city_aqi" in self._daily_history_df.columns:
            rows = self._daily_history_df[self._daily_history_df["date"] == date_str]
            if not rows.empty:
                value = rows.iloc[0]["daily_mean_hourly_city_aqi"]
                if pd.notna(value):
                    return round(float(value), 1), "daily_history_archive"
        return None, None

    def get_notable_episodes(self) -> List[Dict[str, Any]]:
        """Notable chronological episodes, keyed to the replay archive's own values."""
        episodes: List[Dict[str, Any]] = []
        for marker in EPISODE_MARKERS:
            aqi, source = self._episode_aqi(marker["date"])
            if aqi is None:
                # A marker without a resolvable value is dropped rather than shown
                # with an invented number.
                continue
            category, _, _ = get_cpcb_category(aqi)
            episodes.append({
                **marker,
                "typical_aqi": aqi,
                "category": category,
                "aqi_source": source,
                "aqi_definition": (
                    "Frozen 2025 H2 target for this marker date (horizon-independent actual), "
                    "so it matches the replay view. It is a CPCB-method-derived estimate, not an "
                    "official published CPCB daily AQI."
                ),
            })
        return episodes

    def query_replay(self, target_date: str, horizon_days: int = 1) -> Dict[str, Any]:
        """Query historical replay record for a specific date and forecast horizon."""
        if horizon_days not in (1, 2, 3):
            return {
                "success": False,
                "message": f"Unsupported horizon {horizon_days}. Model supports 1, 2, or 3 days ahead.",
                "target_date": target_date,
                "horizon_days": horizon_days,
                "selected_model": "None",
                "provenance_note": "Validation error"
            }

        # Check if held-out test predictions exist for this target date
        if self._test_preds_df is None:
            return {
                "success": False,
                "message": "Test predictions dataset is not loaded.",
                "target_date": target_date,
                "horizon_days": horizon_days,
                "selected_model": "None",
                "provenance_note": "Missing dataset"
            }

        match = self._test_preds_df[
            (self._test_preds_df["target_date"] == target_date) & 
            (self._test_preds_df["horizon_days"] == horizon_days)
        ]

        provenance_disclaimer = (
            "CPCB-method-derived AQI estimate: Reconstructed citywide daily AQI calculated "
            "from pollutant concentrations with CPCB-style breakpoints and data sufficiency rules. "
            "This is a project evaluation estimate and has not been independently verified against "
            "official published daily Delhi CPCB bulletins."
        )

        if match.empty:
            # Check why it's missing to provide a friendly, educational response
            hist_match = self._daily_history_df[self._daily_history_df["date"] == target_date] if self._daily_history_df is not None else pd.DataFrame()
            if not hist_match.empty:
                year = target_date[:4]
                month = int(target_date[5:7])
                if year == "2024":
                    msg = (
                        f"Date {target_date} belongs to the 2024 Model Training Period. "
                        "To maintain strict ML scientific integrity, training rows are not evaluated "
                        "as test predictions. Please select a held-out test date between 2025-07-01 and 2025-12-31."
                    )
                elif year == "2025" and month <= 6:
                    msg = (
                        f"Date {target_date} belongs to the 2025 H1 Validation Period. "
                        "Model selection was performed on this split; test predictions are evaluated on the 2025 H2 holdout."
                    )
                else:
                    msg = f"No held-out prediction found for {target_date} with horizon {horizon_days}."
            elif target_date >= "2026-01-01":
                msg = (
                    f"Date {target_date} is after the historical training archive (ending 2025-12-31). "
                    "For 2026, please switch to Live Forecast Mode."
                )
            else:
                msg = f"Date {target_date} is outside the recorded Delhi air quality archive."

            return {
                "success": False,
                "message": msg,
                "target_date": target_date,
                "horizon_days": horizon_days,
                "selected_model": "None",
                "provenance_note": provenance_disclaimer
            }

        row = match.iloc[0]
        actual = float(row["actual_aqi_estimate"])
        pred = float(row["prediction"])
        persistence = float(row["persistence_prediction"])
        model_name = str(row["selected_model"])
        
        abs_model_err = round(abs(pred - actual), 2)
        abs_persist_err = round(abs(persistence - actual), 2)
        beaten_baseline = abs_model_err <= abs_persist_err

        # Get CPCB category for both predicted and actual values
        cat, color_token, health_stmt = get_cpcb_category(pred)
        act_cat, act_color_token, _ = get_cpcb_category(actual)

        # Unambiguous date formatting: e.g. "12 Nov 2025"
        dt_obj = pd.to_datetime(target_date)
        display_date_str = dt_obj.strftime("%d %b %Y")

        # Get pollutant and weather details from daily history
        pollutants: List[PollutantDetail] = []
        weather = WeatherDetail()

        if self._daily_history_df is not None:
            h_row = self._daily_history_df[self._daily_history_df["date"] == target_date]
            if not h_row.empty:
                r = h_row.iloc[0]
                
                # Pollutant mappings
                pollutant_configs = [
                    ("PM2.5 (µg/m³)", "PM2.5", "Particulate Matter < 2.5 µm", 60.0, "µg/m³"),
                    ("PM10 (µg/m³)", "PM10", "Particulate Matter < 10 µm", 100.0, "µg/m³"),
                    ("NO2 (µg/m³)", "NO2", "Nitrogen Dioxide", 80.0, "µg/m³"),
                    ("SO2 (µg/m³)", "SO2", "Sulphur Dioxide", 80.0, "µg/m³"),
                    ("CO (mg/m³)", "CO", "Carbon Monoxide", 2.0, "mg/m³"),
                    ("Ozone (µg/m³)", "O3", "Ground-level Ozone", 100.0, "µg/m³"),
                    ("NH3 (µg/m³)", "NH3", "Ammonia", 400.0, "µg/m³")
                ]
                
                for col, sym, name, std, unit in pollutant_configs:
                    val = r.get(col)
                    num_val = round(float(val), 2) if pd.notna(val) else None
                    status = "normal"
                    if num_val is not None:
                        if num_val > std * 2:
                            status = "severe"
                        elif num_val > std:
                            status = "exceeded"
                    
                    pollutants.append(PollutantDetail(
                        name=name,
                        symbol=sym,
                        value=num_val,
                        unit=unit,
                        standard_24h=std,
                        status=status
                    ))

                # Weather mappings
                weather.temperature_c = round(float(r["AT (°C)"]), 1) if pd.notna(r.get("AT (°C)")) else None
                weather.humidity_pct = round(float(r["RH (%)"]), 1) if pd.notna(r.get("RH (%)")) else None
                weather.wind_speed_mps = round(float(r["WS (m/s)"]), 2) if pd.notna(r.get("WS (m/s)")) else None
                weather.rainfall_mm = round(float(r["RF_daily_sum_mm"]), 1) if pd.notna(r.get("RF_daily_sum_mm")) else 0.0

        # Construct a 15-day chart series centered around the selected date
        chart_series = self._generate_chart_series(target_date, horizon_days)

        return {
            "success": True,
            "message": f"Successfully retrieved held-out evaluation for {display_date_str} (Horizon: {horizon_days} day(s)).",
            "target_date": target_date,
            "display_date": display_date_str,
            "horizon_days": horizon_days,
            "selected_model": model_name,
            "predicted_aqi": round(pred, 1),
            "actual_aqi_estimate": round(actual, 1),
            "persistence_prediction": round(persistence, 1),
            "absolute_model_error": abs_model_err,
            "absolute_persistence_error": abs_persist_err,
            "model_beaten_baseline": beaten_baseline,
            "aqi_category": cat,
            "aqi_color": color_token,
            "actual_category": act_cat,
            "actual_color": act_color_token,
            "health_statement": health_stmt,
            "pollutants": [p.model_dump() for p in pollutants],
            "weather": weather.model_dump(),
            "chart_series": chart_series,
            "provenance_note": provenance_disclaimer
        }

    def _generate_chart_series(self, target_date: str, horizon: int) -> Dict[str, Any]:
        """Generate time-series curve points for target date +/- 7 days."""
        if self._test_preds_df is None:
            return {}
        
        target_ts = pd.to_datetime(target_date)
        start_date = (target_ts - pd.Timedelta(days=7)).strftime("%Y-%m-%d")
        end_date = (target_ts + pd.Timedelta(days=7)).strftime("%Y-%m-%d")
        
        sub = self._test_preds_df[
            (self._test_preds_df["horizon_days"] == horizon) &
            (self._test_preds_df["target_date"].between(start_date, end_date))
        ].sort_values("target_date")
        
        dates = sub["target_date"].tolist()
        actuals = [round(float(x), 1) for x in sub["actual_aqi_estimate"]]
        preds = [round(float(x), 1) for x in sub["prediction"]]
        persists = [round(float(x), 1) for x in sub["persistence_prediction"]]
        
        return {
            "dates": dates,
            "actuals": actuals,
            "predictions": preds,
            "persistence": persists,
            "active_date": target_date
        }

replay_service = ReplayService()
