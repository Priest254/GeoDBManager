"""Feature dataset endpoints."""
from fastapi import APIRouter, HTTPException, Query
from backend.models.schemas import RenameRequest
from backend.services.field_service import rename_dataset

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.put("/{dataset_name}/rename")
def rename_feat_dataset(
    dataset_name: str,
    req: RenameRequest,
    gdb_path: str = Query(..., description="Full path to the .gdb"),
):
    """Rename a feature dataset and update all its nested feature class paths."""
    try:
        rename_dataset(gdb_path, dataset_name, req.new_name)
        return {"success": True, "message": f"Renamed dataset '{dataset_name}' → '{req.new_name}'"}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
