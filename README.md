# Delhi AQI Prediction

A React + Vite frontend served by the existing FastAPI backend. It provides historical replay of held-out 2025 AQI estimates, model-versus-baseline comparisons, a weather/live-compatibility view, and an external CAMS-derived modelled AQI outlook.

> **Research disclosure:** AQI targets in this project are CPCB-method-derived citywide estimates. They have not been independently verified against official published daily Delhi CPCB bulletins. This is an educational prototype, not an official CPCB service.

## What is in this repo

- `app/` — FastAPI backend, routes, services, static assets, and tests
- `frontend/` — React + Vite dashboard source
- `models/` — trained model bundle used by the backend
- `data/` — historical daily data used by the backend
- `reports/` — frozen model metrics and metadata
- `requirements.txt` — Python dependencies
- `render.yaml` — Render deployment configuration (see below)

## Local quick start (Windows)

### Prerequisites

- Python 3.11+ (or the interpreter compatible with the saved model environment)
- Node.js 22.12+ and npm

### 1. Build the frontend

From the project root (the folder containing `app`, `models`, `data`, `reports`, and `frontend`):

```powershell
cd frontend
npm ci
npm run build
cd ..
```

The production build is written to `app/static/ui/`. The FastAPI backend serves that built UI from `/` and the assets from `/static` and `/assets`.

### 2. Run the backend

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open **https://delhi-aqi-prediction-i78z.onrender.com/**.

## Running tests

```powershell
.\.venv\Scripts\python.exe -m pytest app/tests/ -q
```

## Modes and data

- **Historical Replay:** reads actual records from `reports/test_predictions_2025_H2.csv` and matching daily history from `data/daily_history_2024_2025.csv`.
- **Model Evaluation:** reads frozen metrics from `reports/model_metrics.csv` and metadata from `reports/model_metadata.json`.
- **Weather:** calls the existing Open-Meteo-backed FastAPI route. If the backend falls back to an offline baseline, the UI must label it as a simulated fallback, not an observation.
- **Live AQI:** the API currently reports that compatible current pollution features are unavailable after the archive end date (2025-12-31). The app must therefore not fabricate a 2026 AQI prediction. Weather may still be available independently.

## Architecture

```text
frontend/ (React + Vite)
        | same-origin /api/* requests
        v
app/main.py (FastAPI serves app/static/ui/index.html after build)
        ├── app/routes/replay_routes.py
        ├── app/routes/live_routes.py
        ├── app/services/replay_service.py
        ├── app/services/weather_service.py
        └── app/services/prediction_service.py
                  |
        models/ + data/ + reports/
```

The React build outputs to `app/static/ui/`. `app/main.py` serves the built UI when it exists; otherwise it falls back to the older HTML template. The dashboard’s `/api/*` requests are relative and use the same FastAPI origin.

## Deployment on Render

This repo includes `render.yaml`, which defines a single Render Web Service:

- **Root directory:** project root
- **Build command:** install Node dependencies in `frontend/`, build the React UI into `app/static/ui/`, then install Python dependencies from `requirements.txt`
- **Start command:** uvicorn on `app.main:app`, listening on the Render-assigned port
- **Environment variables:**
  - `DEBUG=false`
  - `DATA_GOV_IN_API_KEY` — set this in Render; it is required only for the live station-observations panel and is never committed

The live station-observations panel is the only feature that needs an API key (from data.gov.in). Weather and the external AQI forecast are public, keyless endpoints.

## Environment variables

- `DEBUG` — optional, defaults to false
- `DATA_GOV_IN_API_KEY` — required only if you want `/api/live/observations` to work

Do not commit `.env`, API keys, `.venv/`, `node_modules/`, or `__pycache__/`.

## Important limitations

- AQI targets are CPCB-method-derived estimates, not independently verified official CPCB bulletin values.
- The frozen archive ends on 2025-12-31. Without refreshed, compatible station/pollutant history, a trustworthy current 2026 AQI forecast is unavailable.
- The live station-observations panel requires a valid `DATA_GOV_IN_API_KEY`. Without it, observations are intentionally unavailable rather than fabricated.
- Weather and the external AQI outlook are public, keyless services and may still be available even when the trained-model forecast path is not.
