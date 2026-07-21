"""Export endpoints — bulk convert layers to ESRI Shapefile or GeoJSON zip archives."""
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.responses import FileResponse
from backend.services.gdb_service import export_features

router = APIRouter(prefix="/api/export", tags=["export"])


class ExportRequest(BaseModel):
    layers: List[str]
    format: str = "shapefile"  # "shapefile" or "geojson"


@router.post("")
def export_bulk(
    gdb_path: str = Query(..., description="Full path to the .gdb"),
    req: ExportRequest = Body(...),
):
    """Export selected layers to a ZIP archive containing Shapefiles or GeoJSON."""
    try:
        zip_path = export_features(gdb_path, req.layers, req.format)
        filename = f"{req.format}_export.zip"
        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename=filename,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
