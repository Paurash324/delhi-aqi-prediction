"""Main FastAPI application entry point for the Delhi AQI Prototype."""
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.security import SecurityMiddleware
from app.routes.replay_routes import router as replay_router
from app.routes.live_routes import router as live_router
from app.routes.external_forecast_routes import router as external_forecast_router
from app.routes.demo_routes import router as demo_router
from app.services.prediction_service import prediction_service
try:
    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
except Exception:
    ProxyHeadersMiddleware = None

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Delhi CPCB-method-derived AQI forecast and historical replay prototype."
)

# Do NOT blindly trust all proxy headers. Only add ProxyHeadersMiddleware if explicitly configured.
trusted_proxy_hosts = getattr(settings, "TRUSTED_PROXY_HOSTS", None)
if ProxyHeadersMiddleware is not None and trusted_proxy_hosts:
    try:
        app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=trusted_proxy_hosts)
    except Exception:
        pass

# Add security & rate limiting middleware
app.add_middleware(SecurityMiddleware)

# Include API routers
app.include_router(replay_router)
app.include_router(live_router)
app.include_router(external_forecast_router)
app.include_router(demo_router)

# Mount static files. The React/Vite UI is built into app/static/ui/ and served
# from this same FastAPI origin so its /api requests use the real backend.
static_dir = Path(__file__).resolve().parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
ui_assets_dir = static_dir / "ui" / "assets"
# Create and mount this directory unconditionally. This also works if the server
# starts before the first frontend build; the build can populate the directory later.
ui_assets_dir.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(ui_assets_dir)), name="ui-public-assets")

templates_dir = Path(__file__).resolve().parent / "templates"
templates_dir.mkdir(parents=True, exist_ok=True)

@app.get("/health")
def health_check():
    """Health check endpoint confirming application and model status."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "model_loaded": prediction_service.is_model_loaded(),
        "target_location": settings.CITY_NAME,
        "timezone": settings.TIMEZONE
    }

@app.get("/", response_class=HTMLResponse)
def index_page():
    """Serve the built React dashboard when available, otherwise the legacy HTML UI."""
    built_index = static_dir / "ui" / "index.html"
    if built_index.exists():
        return FileResponse(str(built_index), media_type="text/html")
    index_file = templates_dir / "index.html"
    if index_file.exists():
        return HTMLResponse(content=index_file.read_text(encoding="utf-8"))
    return HTMLResponse("<h3>Dashboard template not built yet. See README_APP.md for frontend build instructions.</h3>")

# Custom Exception Handlers to prevent stack trace leaks
@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "HTTP Error", "detail": str(exc.detail)}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": "Validation Error", "detail": "The request payload failed validation.", "errors": exc.errors()}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal Server Error", "detail": "A server error occurred. Please contact the administrator."}
    )
