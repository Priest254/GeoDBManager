"""Field-level endpoints: add, rename, delete a field on one feature class."""
from fastapi import APIRouter, HTTPException, Query
from backend.models.schemas import AddFieldRequest, RenameFieldRequest, CalculateFieldRequest
from backend.services import field_service

router = APIRouter(prefix="/api/fields", tags=["fields"])


@router.post("/{layer_name}")
def add_field(
    layer_name: str,
    req: AddFieldRequest,
    gdb_path: str = Query(...),
):
    try:
        added = field_service.add_field(gdb_path, layer_name, req)
        if added:
            return {"success": True, "message": f"Field '{req.name}' added to '{layer_name}'"}
        else:
            return {"success": True, "message": f"Field '{req.name}' already exists in '{layer_name}'"}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{layer_name}/{field_name}/rename")
def rename_field(
    layer_name: str,
    field_name: str,
    req: RenameFieldRequest,
    gdb_path: str = Query(...),
):
    try:
        field_service.rename_field(gdb_path, layer_name, field_name, req.new_name)
        return {"success": True, "message": f"Renamed '{field_name}' → '{req.new_name}'"}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{layer_name}/{field_name}")
def delete_field(
    layer_name: str,
    field_name: str,
    gdb_path: str = Query(...),
):
    try:
        field_service.delete_field(gdb_path, layer_name, field_name)
        return {"success": True, "message": f"Deleted field '{field_name}' from '{layer_name}'"}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{layer_name}/{field_name}/calculate")
def calculate_field(
    layer_name: str,
    field_name: str,
    req: CalculateFieldRequest,
    gdb_path: str = Query(...),
):
    try:
        count = field_service.calculate_field(gdb_path, layer_name, field_name, req.calc_type, req.constant_value)
        return {"success": True, "message": f"Calculated values for {count} features", "affected": [layer_name]}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
