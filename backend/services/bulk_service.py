"""
bulk_service.py
Handles bulk operations across multiple feature classes.
"""
from typing import List, Optional

from backend.models.schemas import (
    BulkAddFieldsRequest,
    BulkDeleteFieldRequest,
    BulkFieldDefinition,
    BulkOperationResult,
    BulkRenameFieldRequest,
    OperationResult,
)
from backend.services import field_service
from backend.services.gdb_service import get_gdb_info


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
        # Features inside a specific dataset
        candidates = []
        for ds in info.datasets:
            if ds.name == dataset:
                candidates = ds.features
                break
    else:
        # All features across datasets + standalone
        candidates = list(info.standalone_features)
        for ds in info.datasets:
            candidates.extend(ds.features)

    if feature_filter:
        candidates = [c for c in candidates if feature_filter.lower() in c.lower()]

    return candidates


def bulk_add_fields(gdb_path: str, req: BulkAddFieldsRequest) -> BulkOperationResult:
    targets = _resolve_targets(gdb_path, req.dataset, req.feature_filter, req.features)
    results: List[OperationResult] = []

    for fc_name in targets:
        try:
            added, skipped = field_service.add_fields_bulk(req.fields, gdb_path, fc_name)
            msg = f"Added {len(added)} field(s) to '{fc_name}'"
            if skipped:
                msg += f" (Skipped {len(skipped)} existing)"
            
            results.append(
                OperationResult(
                    success=True,
                    message=msg,
                    affected=[f.name for f in req.fields],
                )
            )
        except Exception as e:
            results.append(
                OperationResult(success=False, message=str(e), affected=[fc_name])
            )

    succeeded = sum(1 for r in results if r.success)
    return BulkOperationResult(
        total=len(targets),
        succeeded=succeeded,
        failed=len(targets) - succeeded,
        results=results,
    )


def bulk_rename_field(gdb_path: str, req: BulkRenameFieldRequest) -> BulkOperationResult:
    targets = _resolve_targets(gdb_path, req.dataset, req.feature_filter, req.features)
    results: List[OperationResult] = []

    for fc_name in targets:
        try:
            field_service.rename_field(gdb_path, fc_name, req.old_name, req.new_name)
            results.append(
                OperationResult(
                    success=True,
                    message=f"Renamed '{req.old_name}' → '{req.new_name}' in '{fc_name}'",
                    affected=[fc_name],
                )
            )
        except KeyError:
            # Field doesn't exist in this layer — skip silently
            results.append(
                OperationResult(
                    success=True,
                    message=f"Field '{req.old_name}' not present in '{fc_name}' — skipped",
                    affected=[],
                )
            )
        except Exception as e:
            results.append(OperationResult(success=False, message=str(e), affected=[fc_name]))

    succeeded = sum(1 for r in results if r.success)
    return BulkOperationResult(
        total=len(targets),
        succeeded=succeeded,
        failed=len(targets) - succeeded,
        results=results,
    )


def bulk_delete_field(gdb_path: str, req: BulkDeleteFieldRequest) -> BulkOperationResult:
    targets = _resolve_targets(gdb_path, req.dataset, req.feature_filter, req.features)
    results: List[OperationResult] = []

    for fc_name in targets:
        try:
            field_service.delete_field(gdb_path, fc_name, req.field_name)
            results.append(
                OperationResult(
                    success=True,
                    message=f"Deleted field '{req.field_name}' from '{fc_name}'",
                    affected=[fc_name],
                )
            )
        except KeyError:
            results.append(
                OperationResult(
                    success=True,
                    message=f"Field '{req.field_name}' not in '{fc_name}' — skipped",
                    affected=[],
                )
            )
        except Exception as e:
            results.append(OperationResult(success=False, message=str(e), affected=[fc_name]))

    succeeded = sum(1 for r in results if r.success)
    return BulkOperationResult(
        total=len(targets),
        succeeded=succeeded,
        failed=len(targets) - succeeded,
        results=results,
    )
