"""Pydantic schemas for request and response data validation."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class PollutantDetail(BaseModel):
    name: str
    symbol: str
    value: Optional[float] = None
    unit: str
    standard_24h: Optional[float] = None
    status: Optional[str] = None

class WeatherDetail(BaseModel):
    temperature_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    wind_speed_mps: Optional[float] = None
    rainfall_mm: Optional[float] = None
    weather_desc: Optional[str] = None

class ReplayQueryResponse(BaseModel):
    success: bool
    message: str
    target_date: str
    display_date: Optional[str] = None
    horizon_days: int
    selected_model: str
    predicted_aqi: Optional[float] = None
    actual_aqi_estimate: Optional[float] = None
    persistence_prediction: Optional[float] = None
    absolute_model_error: Optional[float] = None
    absolute_persistence_error: Optional[float] = None
    model_beaten_baseline: Optional[bool] = None
    aqi_category: Optional[str] = None
    aqi_color: Optional[str] = None
    actual_category: Optional[str] = None
    actual_color: Optional[str] = None
    health_statement: Optional[str] = None
    pollutants: List[PollutantDetail] = Field(default_factory=list)
    weather: Optional[WeatherDetail] = None
    chart_series: Dict[str, Any] = Field(default_factory=dict)
    provenance_note: str

class LiveWeatherResponse(BaseModel):
    success: bool
    source: str
    timestamp: str
    city: str
    current: Dict[str, Any] = Field(default_factory=dict)
    tomorrow_forecast: Dict[str, Any] = Field(default_factory=dict)
    daily_timeline: List[Dict[str, Any]] = Field(default_factory=list)
    cached: bool = False
    warning: Optional[str] = None

class LiveAQIStatusResponse(BaseModel):
    forecast_available: bool
    message: str
    reason: str
    target_label: str
    required_features: List[str]
    missing_features: List[str]
    provenance_disclaimer: str
    viva_explanation: str

class ModelMetricsResponse(BaseModel):
    metrics: List[Dict[str, Any]]
    limitations: List[str]
    day3_policy: str
    training_period: str
    test_period: str
