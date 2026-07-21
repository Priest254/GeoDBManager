"""Bulk operation endpoints — apply field operations across many feature classes."""
from fastapi import APIRouter, Body, HTTPException, Query
from backend.models.schemas import (
    BulkAddFieldsRequest,
    BulkDeleteFieldRequest,
    BulkOperationResult,
    BulkRenameFieldRequest,
)
from backend.services import bulk_service

router = APIRouter(prefix="/api/bulk", tags=["bulk"])


@router.post("/add-fields", response_model=BulkOperationResult)
def bulk_add_fields(
    gdb_path: str = Query(..., description="Full path to the .gdb"),
    req: BulkAddFieldsRequest = Body(...),
):
    try:
        return bulk_service.bulk_add_fields(gdb_path, req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rename-field", response_model=BulkOperationResult)
def bulk_rename_field(
    gdb_path: str = Query(..., description="Full path to the .gdb"),
    req: BulkRenameFieldRequest = Body(...),
):
    try:
        return bulk_service.bulk_rename_field(gdb_path, req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/delete-field", response_model=BulkOperationResult)
def bulk_delete_field(
    gdb_path: str = Query(..., description="Full path to the .gdb"),
    req: BulkDeleteFieldRequest = Body(...),
):
    try:
        return bulk_service.bulk_delete_field(gdb_path, req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
