# React/Vite frontend for Delhi AQI

This frontend was exported from Google AI Studio and adapted to the existing FastAPI backend contract. It uses relative `/api/...` URLs by default. When built and served by FastAPI, API requests stay same-origin and use the real backend.

## Development preview

With FastAPI running on port 8000, open a second terminal here:

```powershell
npm install
npm run dev
```

Vite runs on port 3000 and proxies `/api/*` to `http://127.0.0.1:8000` by default. For another local backend URL, set `VITE_FASTAPI_URL` in your shell before launching Vite.

## Production build

From this directory:

```powershell
npm install
npm run build
```

Vite writes the production bundle to `../app/static/ui/`. FastAPI serves that `index.html` at `/` and serves the built assets via `/static/ui/...`. The CSS background asset `/assets/delhi-aqi-bg.jpg` is exposed by the FastAPI `/assets` static mount.

## Data integrity

Historical values come from the existing FastAPI replay endpoints. The project target is a CPCB-method-derived citywide AQI estimate, not independently verified official daily CPCB AQI. Live weather and AQI status are separate; no live AQI prediction should be shown unless compatible current inputs are available.
