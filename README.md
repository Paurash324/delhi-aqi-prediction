# 🌫️ Delhi Air Intelligence — AQI Prediction & Analysis

<p align="center">
  <strong>An AI/ML-powered air quality analysis and forecasting platform for Delhi, India.</strong>
</p>

<p align="center">
  <a href="https://delhi-aqi-prediction-i78z.onrender.com/">
    <img src="https://img.shields.io/badge/Live%20Demo-Visit%20Website-2ea44f?style=for-the-badge" alt="Live Demo">
  </a>
  <img src="https://img.shields.io/badge/Python-FastAPI-blue?style=for-the-badge" alt="Python FastAPI">
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?style=for-the-badge" alt="React">
  <img src="https://img.shields.io/badge/Machine%20Learning-Scikit--learn-orange?style=for-the-badge" alt="Machine Learning">
</p>

---

## 📌 Overview

**Delhi Air Intelligence** is an educational AI/ML project designed to analyze Delhi's air quality, explore historical AQI patterns, evaluate machine learning models, and provide air-quality forecasting features.

The platform combines a Python-based machine learning backend with a modern React dashboard.

It focuses on:
- Historical AQI analysis and replay.
- Machine learning model evaluation.
- AQI prediction experiments.
- Weather information integration.
- Model-versus-baseline performance comparisons.
- An interactive dashboard for exploring results.

## 🚀 Live Demo

**Website:** https://delhi-aqi-prediction-i78z.onrender.com/

The project is deployed using Render.

## 🧠 Machine Learning Models

The project uses supervised machine learning regression algorithms to learn patterns from historical air-quality and related data.

| Model | Purpose |
|---|---|
| Gradient Boosting Regressor | 1-day AQI prediction |
| Random Forest Regressor | 2-day AQI prediction |
| HistGradientBoosting Regressor | Evaluated for 3-day prediction |
| Persistence Baseline | Selected fallback for 3-day prediction |

### Model explanations

**1. Gradient Boosting Regressor**

Builds multiple decision trees sequentially. Each new tree attempts to correct errors made by earlier trees.

**2. Random Forest Regressor**

Uses multiple decision trees and combines their predictions to produce a final estimate.

**3. HistGradientBoosting Regressor**

A histogram-based implementation of gradient boosting designed to train efficiently on numerical datasets.

**4. Persistence Baseline**

Uses the latest available AQI value as a simple forecast baseline. It is not a trained machine learning algorithm.

### Model Performance

Reported results on the held-out 2025 test period:

| Forecast Horizon | Selected Approach | MAE | RMSE |
|---|---|---:|---:|
| 1 Day | Gradient Boosting | 15.78 | 21.89 |
| 2 Days | Random Forest | 29.03 | 39.96 |
| 3 Days | Persistence Baseline | 33.43 | — |

**Evaluation metrics:**
- MAE (Mean Absolute Error): Average absolute difference between predicted and actual values.
- RMSE (Root Mean Squared Error): Measures prediction error while penalizing larger errors more strongly.

The 3-day persistence baseline performed better than the tested HistGradientBoosting model, so it was selected for that horizon.

## ✨ Key Features

- **Historical Replay:** Explore historical AQI records and saved predictions.
- **Model Evaluation:** Review model performance using saved evaluation reports.
- **Prediction Comparison:** Compare model predictions against baseline approaches.
- **Weather Integration:** Retrieve weather information through the Open-Meteo API.
- **Interactive Dashboard:** Explore project outputs through a React-based interface.
- **FastAPI Backend:** Python backend providing API endpoints for the dashboard.
- **Render Deployment:** Hosted web application with a production build of the frontend.

## 🏗️ Technology Stack

| Technology | Usage |
|---|---|
| Python | Backend and ML development |
| FastAPI | Backend API |
| Scikit-learn | Machine learning algorithms |
| Pandas | Data processing |
| NumPy | Numerical computation |
| React | Frontend interface |
| TypeScript | Frontend development |
| Vite | Frontend build tooling |
| Open-Meteo API | Weather data |
| Render | Deployment |
| Git & GitHub | Version control |

## 📂 Project Structure

```text
Delhi-AQI-Prediction/
│
├── app/
│   ├── main.py
│   ├── routes/
│   ├── services/
│   ├── static/
│   └── tests/
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── models/
│   └── delhi_citywide_aqi_models.joblib
│
├── data/
│   └── daily_history_2024_2025.csv
│
├── reports/
│   ├── model_metrics.csv
│   ├── model_metadata.json
│   └── test_predictions_2025_H2.csv
│
├── requirements.txt
├── render.yaml
└── README.md
```

## ⚙️ Installation & Setup

### Prerequisites

- Python 3.11 or later
- Node.js 22.12 or later
- npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/Paurash324/delhi-aqi-prediction.git
cd delhi-aqi-prediction
```

### 2. Create and activate a virtual environment

**Windows PowerShell:**

```powershell
python -m venv .venv
.venv\Scripts\activate
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Build the frontend

```bash
cd frontend
npm ci
npm run build
cd ..
```

The frontend production build is generated inside:

```text
app/static/ui/
```

### 5. Start the backend

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 6. Open the application

Dashboard:

```text
http://127.0.0.1:8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

## 🧪 Running Tests

Run the backend test suite:

```bash
python -m pytest app/tests/ -q
```

## 🔌 APIs & Data Sources

**Open-Meteo:** Used for weather information.

**Historical project data:** The repository includes historical daily data and frozen model evaluation outputs.

**Data.gov.in:** An API key can be configured for the live station-observations feature.

To enable that feature, configure:

```env
DATA_GOV_IN_API_KEY=your_api_key_here
```

Never commit API keys or private environment files to GitHub.

## ⚠️ Important Limitations

This project is an educational prototype, not an official government AQI monitoring service.

- The historical data archive currently ends on December 31, 2025.
- A trustworthy current 2026 trained-model AQI forecast requires refreshed, compatible pollution features and historical data.
- The application must not present unavailable live ML predictions as genuine model outputs.
- Live station observations require a valid Data.gov.in API key.
- Weather information is independent of the trained AQI prediction models.
- The external AQI outlook is a separate forecast source, not a prediction generated by the historical trained-model bundle.
- Model performance is based on the project's held-out test data and should not be interpreted as a guarantee of future accuracy.

## 🎯 Project Objective

The primary objective is to demonstrate how machine learning can be applied to air-quality analysis and forecasting.

The project combines:
- Supervised learning.
- Regression algorithms.
- Historical data analysis.
- Model evaluation.
- API development.
- Frontend and backend integration.
- Cloud deployment.

## 👨‍💻 Developer

**Developed by:** Paurash

**GitHub:** https://github.com/Paurash324

**Project Repository:** https://github.com/Paurash324/delhi-aqi-prediction

---

<p align="center">
  <strong>Delhi Air Intelligence</strong><br>
  Making air-quality data easier to explore and understand.
</p>

