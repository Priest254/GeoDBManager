"""Export endpoints — bulk convert layers to ESRI Shapefile or GeoJSON zip archives."""
import shutil
from pathlib import Path
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Body
from fastapi.responses import FileResponse
from backend.services.gdb_service import export_features

router = APIRouter(prefix="/api/export", tags=["export"])


class ExportRequest(BaseModel):
    layers: List[str]
    format: str = "shapefile"  # "shapefile" or "geojson"


def cleanup_temp_dir(temp_dir: str):
    try:
        shutil.rmtree(temp_dir)
    except Exception:
        pass


@router.post("")
def export_bulk(
    background_tasks: BackgroundTasks,
    gdb_path: str = Query(..., description="Full path to the .gdb"),
    req: ExportRequest = Body(...),
):
    """Export selected layers to a ZIP archive containing Shapefiles or GeoJSON."""
    try:
        zip_path = export_features(gdb_path, req.layers, req.format)
        filename = f"{req.format}_export.zip"
        background_tasks.add_task(cleanup_temp_dir, str(Path(zip_path).parent))
        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename=filename,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
