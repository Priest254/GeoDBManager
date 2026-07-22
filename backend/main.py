"""
main.py — FastAPI application entry point.
Serves the REST API and the static frontend SPA.
"""
from pathlib import Path
from osgeo import gdal, ogr

# Suppress GDAL/OGR noise before any driver is loaded.
# CPLQuietErrorHandler stops Python-level callbacks from printing.
# The config options suppress C-level driver stderr messages:
#   - OGR_GEOMETRY_ACCEPT_UNCLOSED_RING=YES  → accept silently (no warning).
#   - CPL_LOG_ERRORS=OFF                      → skip error log file writes.
gdal.SetConfigOption("OGR_GEOMETRY_ACCEPT_UNCLOSED_RING", "YES")
gdal.SetConfigOption("CPL_LOG_ERRORS", "OFF")
gdal.PushErrorHandler("CPLQuietErrorHandler")
ogr.UseExceptions()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.routers import geodatabase, features, fields, bulk, datasets, export, jobs

# ── App factory ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="GeoDBManager API",
    description="Manage Esri File Geodatabases via REST",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_no_cache_header(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/static") or path.endswith(".js") or path.endswith(".css"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# ── API Routers ───────────────────────────────────────────────────────────────
app.include_router(geodatabase.router)
app.include_router(features.router)
app.include_router(datasets.router)
app.include_router(fields.router)
app.include_router(bulk.router)
app.include_router(jobs.router)
app.include_router(export.router)

# ── Static Frontend ───────────────────────────────────────────────────────────
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    async def serve_index():
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def catch_all(full_path: str):
        # Serve static files; fall back to index.html for SPA routing
        file_path = FRONTEND_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIR / "index.html"))
