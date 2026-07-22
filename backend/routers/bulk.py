"""Bulk operation endpoints — apply field operations across many feature classes."""
from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Query
from backend.models.schemas import (
    BulkAddFieldsRequest,
    BulkCalculateFieldRequest,
    BulkDeleteFieldRequest,
    BulkOperationResult,
    BulkRenameFieldRequest,
)
from backend.services import bulk_service
from backend.services.job_service import job_registry

router = APIRouter(prefix="/api/bulk", tags=["bulk"])


# ── Synchronous Endpoints (Legacy / Direct) ──────────────────────────────────

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


@router.post("/calculate-field", response_model=BulkOperationResult)
def bulk_calculate_field(
    gdb_path: str = Query(..., description="Full path to the .gdb"),
    req: BulkCalculateFieldRequest = Body(...),
):
    try:
        return bulk_service.bulk_calculate_field(gdb_path, req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Asynchronous Background Job Endpoints ─────────────────────────────────────

@router.post("/add-fields-async")
def bulk_add_fields_async(
    background_tasks: BackgroundTasks,
    gdb_path: str = Query(..., description="Full path to the .gdb"),
    req: BulkAddFieldsRequest = Body(...),
):
    targets = bulk_service._resolve_targets(gdb_path, req.dataset, req.feature_filter, req.features)
    job = job_registry.create_job("Bulk Add Fields", total_targets=len(targets))
    background_tasks.add_task(bulk_service.bulk_add_fields, gdb_path, req, job.job_id)
    return {"job_id": job.job_id, "operation": job.operation, "total_targets": len(targets)}


@router.post("/rename-field-async")
def bulk_rename_field_async(
    background_tasks: BackgroundTasks,
    gdb_path: str = Query(..., description="Full path to the .gdb"),
    req: BulkRenameFieldRequest = Body(...),
):
    targets = bulk_service._resolve_targets(gdb_path, req.dataset, req.feature_filter, req.features)
    job = job_registry.create_job("Bulk Rename Field", total_targets=len(targets))
    background_tasks.add_task(bulk_service.bulk_rename_field, gdb_path, req, job.job_id)
    return {"job_id": job.job_id, "operation": job.operation, "total_targets": len(targets)}


@router.post("/delete-field-async")
def bulk_delete_field_async(
    background_tasks: BackgroundTasks,
    gdb_path: str = Query(..., description="Full path to the .gdb"),
    req: BulkDeleteFieldRequest = Body(...),
):
    targets = bulk_service._resolve_targets(gdb_path, req.dataset, req.feature_filter, req.features)
    job = job_registry.create_job("Bulk Delete Field", total_targets=len(targets))
    background_tasks.add_task(bulk_service.bulk_delete_field, gdb_path, req, job.job_id)
    return {"job_id": job.job_id, "operation": job.operation, "total_targets": len(targets)}


@router.post("/calculate-field-async")
def bulk_calculate_field_async(
    background_tasks: BackgroundTasks,
    gdb_path: str = Query(..., description="Full path to the .gdb"),
    req: BulkCalculateFieldRequest = Body(...),
):
    targets = bulk_service._resolve_targets(gdb_path, req.dataset, req.feature_filter, req.features)
    job = job_registry.create_job(f"Bulk Calculate Field ({req.calc_type})", total_targets=len(targets))
    background_tasks.add_task(bulk_service.bulk_calculate_field, gdb_path, req, job.job_id)
    return {"job_id": job.job_id, "operation": job.operation, "total_targets": len(targets)}
