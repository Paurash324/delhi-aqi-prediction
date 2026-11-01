"""Configuration settings for the Delhi AQI Prediction College Prototype."""
from pathlib import Path
from pydantic import BaseModel
import os

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseModel):
    APP_NAME: str = "Delhi AQI Forecast Lab Prototype"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Paths to frozen artifacts
    DATA_DIR: Path = BASE_DIR / "data"
    REPORTS_DIR: Path = BASE_DIR / "reports"
    MODELS_DIR: Path = BASE_DIR / "models"
    
    DAILY_HISTORY_FILE: Path = DATA_DIR / "daily_history_2024_2025.csv"
    TEST_PREDICTIONS_FILE: Path = REPORTS_DIR / "test_predictions_2025_H2.csv"
    MODEL_METRICS_FILE: Path = REPORTS_DIR / "model_metrics.csv"
    MODEL_METADATA_FILE: Path = REPORTS_DIR / "model_metadata.json"
    MODEL_BUNDLE_FILE: Path = MODELS_DIR / "delhi_citywide_aqi_models.joblib"
    
    # Cache settings
    CACHE_DIR: Path = BASE_DIR / "app" / "cache"
    WEATHER_CACHE_FILE: Path = CACHE_DIR / "weather_cache.json"
    CACHE_EXPIRY_SECONDS: int = 1800  # 30 minutes
    
    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 300
    # Trusted proxy hosts/IPs for header-based client IP extraction.
    # Leave empty to be conservative (do not trust forwarded headers).
    TRUSTED_PROXY_HOSTS: list = []

    # Live station observations (data.gov.in real-time CPCB resource).
    # The credential is read from the environment at call time and is never
    # stored on the model or returned to a client.
    OBSERVATIONS_RECORD_LIMIT: int = 500
    OBSERVATIONS_CACHE_TTL_SECONDS: int = 600
    OBSERVATIONS_TIMEOUT_SECONDS: float = 10.0
    OBSERVATIONS_STALE_AFTER_HOURS: float = 12.0
    OBSERVATIONS_CITY: str = "Delhi"
    
    # Location fixed to Delhi NCT
    CITY_NAME: str = "Delhi"
    LATITUDE: float = 28.6139
    LONGITUDE: float = 77.2090
    TIMEZONE: str = "Asia/Kolkata"

    @property
    def data_gov_in_api_key(self) -> str:
        """Read the data.gov.in credential fresh from the environment.

        Re-read on every access so tests and operators can configure it without
        reloading the module. An empty string means "not configured"; callers must
        treat that as unavailable rather than falling back to any bundled value.
        """
        return os.environ.get("DATA_GOV_IN_API_KEY", "").strip()

settings = Settings()
settings.CACHE_DIR.mkdir(parents=True, exist_ok=True)