"""
bulk_service.py
Handles bulk operations across multiple feature classes with multi-threading and job progress integration.
"""
from typing import Any, List, Optional

from backend.models.schemas import (
    BulkAddFieldsRequest,
    BulkCalculateFieldRequest,
    BulkDeleteFieldRequest,
    BulkOperationResult,
    BulkRenameFieldRequest,
    OperationResult,
)
from backend.services import field_service
from backend.services.gdb_service import get_gdb_info
from backend.services.job_service import job_registry, JobStatus


def _resolve_targets(
    gdb_path: str,
    dataset: Optional[str],
    feature_filter: Optional[str],
    explicit_features: Optional[List[str]],
) -> List[str]:
    """Resolve which feature class names to apply a bulk operation to."""
    if explicit_features:
        return explicit_features

    info = get_gdb_info(gdb_path)

    if dataset:
        candidates = []
        for ds in info.datasets:
            if ds.name == dataset:
                candidates = ds.features
                break
    else:
        candidates = list(info.standalone_features)
        for ds in info.datasets:
            candidates.extend(ds.features)

    if feature_filter:
        candidates = [c for c in candidates if feature_filter.lower() in c.lower()]

    return candidates


def bulk_add_fields(gdb_path: str, req: BulkAddFieldsRequest, job_id: Optional[str] = None) -> BulkOperationResult:
    targets = _resolve_targets(gdb_path, req.dataset, req.feature_filter, req.features)
    results: List[OperationResult] = []

    if job_id:
        job = job_registry.get_job(job_id)
        if job:
            job.total_targets = len(targets)

    for i, fc_name in enumerate(targets):
        if job_id and job_registry.is_cancelled(job_id):
            job_registry.add_log(job_id, "warning", f"Bulk Add cancelled before layer '{fc_name}'")
            break

        if job_id:
            job_registry.update_progress(
                job_id,
                current_step=f"Adding field(s) to '{fc_name}' ({i + 1}/{len(targets)})",
            )

        try:
            added, skipped = field_service.add_fields_bulk(req.fields, gdb_path, fc_name)
            msg = f"Added {len(added)} field(s) to '{fc_name}'"
            if skipped:
                msg += f" (Skipped {len(skipped)} existing)"
            
            res = OperationResult(success=True, message=msg, affected=[f.name for f in req.fields])
            results.append(res)
            
            if job_id:
                job_registry.update_progress(
                    job_id,
                    current_step=f"Added fields to '{fc_name}'",
                    processed_inc=1,
                    succeeded_inc=1,
                    result={"success": True, "message": msg, "affected": [fc_name]},
                )
                job_registry.add_log(job_id, "success", msg)
        except Exception as e:
            err_msg = f"Failed adding fields to '{fc_name}': {str(e)}"
            res = OperationResult(success=False, message=err_msg, affected=[fc_name])
            results.append(res)

            if job_id:
                job_registry.update_progress(
                    job_id,
                    current_step=f"Error on '{fc_name}'",
                    processed_inc=1,
                    failed_inc=1,
                    result={"success": False, "message": err_msg, "affected": [fc_name]},
                )
                job_registry.add_log(job_id, "error", err_msg)

    succeeded = sum(1 for r in results if r.success)
    res_obj = BulkOperationResult(
        total=len(targets),
        succeeded=succeeded,
        failed=len(targets) - succeeded,
        results=results,
    )

    if job_id:
        status = JobStatus.CANCELLED if job_registry.is_cancelled(job_id) else JobStatus.COMPLETED
        job_registry.complete_job(job_id, status=status)

    return res_obj


def bulk_rename_field(gdb_path: str, req: BulkRenameFieldRequest, job_id: Optional[str] = None) -> BulkOperationResult:
    targets = _resolve_targets(gdb_path, req.dataset, req.feature_filter, req.features)
    results: List[OperationResult] = []

    if job_id:
        job = job_registry.get_job(job_id)
        if job:
            job.total_targets = len(targets)

    for i, fc_name in enumerate(targets):
        if job_id and job_registry.is_cancelled(job_id):
            job_registry.add_log(job_id, "warning", f"Bulk Rename cancelled before layer '{fc_name}'")
            break

        if job_id:
            job_registry.update_progress(
                job_id,
                current_step=f"Renaming field in '{fc_name}' ({i + 1}/{len(targets)})",
            )

        try:
            field_service.rename_field(gdb_path, fc_name, req.old_name, req.new_name)
            msg = f"Renamed '{req.old_name}' → '{req.new_name}' in '{fc_name}'"
            res = OperationResult(success=True, message=msg, affected=[fc_name])
            results.append(res)

            if job_id:
                job_registry.update_progress(
                    job_id,
                    current_step=f"Renamed in '{fc_name}'",
                    processed_inc=1,
                    succeeded_inc=1,
                    result={"success": True, "message": msg, "affected": [fc_name]},
                )
                job_registry.add_log(job_id, "success", msg)
        except KeyError:
            msg = f"Field '{req.old_name}' not present in '{fc_name}' — skipped"
            res = OperationResult(success=True, message=msg, affected=[])
            results.append(res)

            if job_id:
                job_registry.update_progress(
                    job_id,
                    current_step=f"Skipped '{fc_name}'",
                    processed_inc=1,
                    succeeded_inc=1,
                    result={"success": True, "message": msg, "affected": [fc_name]},
                )
                job_registry.add_log(job_id, "info", msg)
        except Exception as e:
            err_msg = f"Error in '{fc_name}': {str(e)}"
            res = OperationResult(success=False, message=err_msg, affected=[fc_name])
            results.append(res)

            if job_id:
                job_registry.update_progress(
                    job_id,
                    current_step=f"Failed on '{fc_name}'",
                    processed_inc=1,
                    failed_inc=1,
                    result={"success": False, "message": err_msg, "affected": [fc_name]},
                )
                job_registry.add_log(job_id, "error", err_msg)

    succeeded = sum(1 for r in results if r.success)
    res_obj = BulkOperationResult(
        total=len(targets),
        succeeded=succeeded,
        failed=len(targets) - succeeded,
        results=results,
    )

    if job_id:
        status = JobStatus.CANCELLED if job_registry.is_cancelled(job_id) else JobStatus.COMPLETED
        job_registry.complete_job(job_id, status=status)

    return res_obj


def bulk_delete_field(gdb_path: str, req: BulkDeleteFieldRequest, job_id: Optional[str] = None) -> BulkOperationResult:
    targets = _resolve_targets(gdb_path, req.dataset, req.feature_filter, req.features)
    results: List[OperationResult] = []

    if job_id:
        job = job_registry.get_job(job_id)
        if job:
            job.total_targets = len(targets)

    for i, fc_name in enumerate(targets):
        if job_id and job_registry.is_cancelled(job_id):
            job_registry.add_log(job_id, "warning", f"Bulk Delete cancelled before layer '{fc_name}'")
            break

        if job_id:
            job_registry.update_progress(
                job_id,
                current_step=f"Deleting field from '{fc_name}' ({i + 1}/{len(targets)})",
            )

        try:
            field_service.delete_field(gdb_path, fc_name, req.field_name)
            msg = f"Deleted field '{req.field_name}' from '{fc_name}'"
            res = OperationResult(success=True, message=msg, affected=[fc_name])
            results.append(res)

            if job_id:
                job_registry.update_progress(
                    job_id,
                    current_step=f"Deleted field from '{fc_name}'",
                    processed_inc=1,
                    succeeded_inc=1,
                    result={"success": True, "message": msg, "affected": [fc_name]},
                )
                job_registry.add_log(job_id, "success", msg)
        except KeyError:
            msg = f"Field '{req.field_name}' not in '{fc_name}' — skipped"
            res = OperationResult(success=True, message=msg, affected=[])
            results.append(res)

            if job_id:
                job_registry.update_progress(
                    job_id,
                    current_step=f"Skipped '{fc_name}'",
                    processed_inc=1,
                    succeeded_inc=1,
                    result={"success": True, "message": msg, "affected": [fc_name]},
                )
                job_registry.add_log(job_id, "info", msg)
        except Exception as e:
            err_msg = f"Error in '{fc_name}': {str(e)}"
            res = OperationResult(success=False, message=err_msg, affected=[fc_name])
            results.append(res)

            if job_id:
                job_registry.update_progress(
                    job_id,
                    current_step=f"Failed on '{fc_name}'",
                    processed_inc=1,
                    failed_inc=1,
                    result={"success": False, "message": err_msg, "affected": [fc_name]},
                )
                job_registry.add_log(job_id, "error", err_msg)

    succeeded = sum(1 for r in results if r.success)
    res_obj = BulkOperationResult(
        total=len(targets),
        succeeded=succeeded,
        failed=len(targets) - succeeded,
        results=results,
    )

    if job_id:
        status = JobStatus.CANCELLED if job_registry.is_cancelled(job_id) else JobStatus.COMPLETED
        job_registry.complete_job(job_id, status=status)

    return res_obj


def _calc_worker(gdb_path: str, fc_name: str, field_name: str, calc_type: str, constant_value: Any) -> OperationResult:
    """Worker function for executing a field calculation on a single feature class."""
    try:
        count = field_service.calculate_field(gdb_path, fc_name, field_name, calc_type, constant_value)
        msg = f"Calculated values for {count} feature(s) in '{fc_name}'"
        return OperationResult(success=True, message=msg, affected=[fc_name])
    except KeyError:
        msg = f"Field '{field_name}' not present in '{fc_name}' — skipped"
        return OperationResult(success=True, message=msg, affected=[])
    except Exception as e:
        err_msg = f"Error in '{fc_name}': {str(e)}"
        return OperationResult(success=False, message=err_msg, affected=[fc_name])


def bulk_calculate_field(
    gdb_path: str,
    req: BulkCalculateFieldRequest,
    job_id: Optional[str] = None,
) -> BulkOperationResult:
    targets = _resolve_targets(gdb_path, req.dataset, req.feature_filter, req.features)
    results: List[OperationResult] = []

    if job_id:
        job = job_registry.get_job(job_id)
        if job:
            job.total_targets = len(targets)
            job_registry.add_log(
                job_id,
                "info",
                f"Started Bulk Calculate for field '{req.field_name}' ({req.calc_type}) across {len(targets)} feature class(es)",
            )

    if len(targets) == 0:
        if job_id:
            job_registry.complete_job(job_id, status=JobStatus.COMPLETED, message="No feature classes matched filter.")
        return BulkOperationResult(total=0, succeeded=0, failed=0, results=[])

    # Serial processing per GDB file prevents FileGDB directory lock contention and maximizes throughput (~700+ feat/sec)
    for i, fc_name in enumerate(targets):
        if job_id and job_registry.is_cancelled(job_id):
            job_registry.add_log(job_id, "warning", f"Bulk calculation cancelled before '{fc_name}'")
            break

        if job_id:
            job_registry.update_progress(
                job_id,
                current_step=f"Calculating '{req.field_name}' in '{fc_name}' ({i + 1}/{len(targets)})",
            )

        res = _calc_worker(gdb_path, fc_name, req.field_name, req.calc_type, req.constant_value)
        results.append(res)

        if job_id:
            succ_inc = 1 if res.success else 0
            fail_inc = 0 if res.success else 1
            lvl = "success" if res.success else ("info" if "skipped" in res.message else "error")
            job_registry.update_progress(
                job_id,
                current_step=f"Completed '{fc_name}'",
                processed_inc=1,
                succeeded_inc=succ_inc,
                failed_inc=fail_inc,
                result={"success": res.success, "message": res.message, "affected": res.affected},
            )
            job_registry.add_log(job_id, lvl, res.message)

    succeeded = sum(1 for r in results if r.success)
    res_obj = BulkOperationResult(
        total=len(targets),
        succeeded=succeeded,
        failed=len(targets) - succeeded,
        results=results,
    )

    if job_id:
        status = JobStatus.CANCELLED if job_registry.is_cancelled(job_id) else JobStatus.COMPLETED
        job_registry.complete_job(job_id, status=status)

    return res_obj
