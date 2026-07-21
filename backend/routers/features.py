"""Feature class endpoints: get schema, rename."""
from fastapi import APIRouter, HTTPException, Query
from backend.models.schemas import FeatureInfo, RenameRequest
from backend.services.gdb_service import get_feature_info, get_feature_data
from backend.services.field_service import rename_layer

router = APIRouter(prefix="/api/features", tags=["features"])


@router.get("/{layer_name}", response_model=FeatureInfo)
def get_feature(
    layer_name: str,
    gdb_path: str = Query(..., description="Full path to the .gdb"),
    dataset: str = Query(None, description="Parent dataset name (optional)"),
):
    """Get full schema and metadata for a feature class."""
    try:
        return get_feature_info(gdb_path, layer_name, dataset)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{layer_name}/data")
def get_feature_data_preview(
    layer_name: str,
    gdb_path: str = Query(..., description="Full path to the .gdb"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """Fetch attribute table rows for a feature class."""
    try:
        return get_feature_data(gdb_path, layer_name, limit, offset)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{layer_name}/rename")
def rename_feature(
    layer_name: str,
    req: RenameRequest,
    gdb_path: str = Query(..., description="Full path to the .gdb"),
):
    """Rename a feature class in-place."""
    try:
        rename_layer(gdb_path, layer_name, req.new_name)
        return {"success": True, "message": f"Renamed '{layer_name}' → '{req.new_name}'"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
