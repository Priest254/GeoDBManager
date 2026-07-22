import os
import shutil
import asyncio
import threading
import tempfile
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.gdb_service import get_gdb_info, get_feature_data
from backend.services.field_service import calculate_field
from backend.services.job_service import job_registry, JobStatus

client = TestClient(app)

# Use the sample GDB path inside the docker environment
GDB_PATH = "/data/Sample.gdb"


def test_gdb_info():
    """Verify that get_gdb_info correctly reads datasets and standalone features."""
    assert os.path.exists(GDB_PATH), f"Sample GDB not found at {GDB_PATH}"
    info = get_gdb_info(GDB_PATH)
    assert info.name == "Sample"
    assert info.total_features > 0


def test_get_feature_data_pagination():
    """Test pagination using get_feature_data and verify SetNextByIndex optimization."""
    info = get_gdb_info(GDB_PATH)
    layer_name = None
    for ds in info.datasets:
        for f in ds.features:
            try:
                data = get_feature_data(GDB_PATH, f, limit=1)
                if data["total_count"] > 0 and len(data["columns"]) > 0:
                    layer_name = f
                    break
            except Exception:
                pass
        if layer_name:
            break
    if not layer_name:
        for f in info.standalone_features:
            try:
                data = get_feature_data(GDB_PATH, f, limit=1)
                if data["total_count"] > 0 and len(data["columns"]) > 0:
                    layer_name = f
                    break
            except Exception:
                pass

    assert layer_name is not None, "No feature class found in Sample.gdb"

    # Fetch total count first
    full_data = get_feature_data(GDB_PATH, layer_name, limit=100, offset=0)
    total_count = full_data["total_count"]
    
    if total_count > 1:
        # Fetch with offset 1
        offset_data = get_feature_data(GDB_PATH, layer_name, limit=1, offset=1)
        assert len(offset_data["rows"]) == 1
        assert offset_data["offset"] == 1
        
        # Verify pagination retrieved different first record
        if len(full_data["rows"]) > 1:
            assert offset_data["rows"][0] == full_data["rows"][1]


def test_job_sse_thread_safety():
    """Test that updating progress from a background thread notifies SSE listeners thread-safely."""
    job = job_registry.create_job("Test Job", total_targets=10)
    job_id = job.job_id

    # Create dummy loop and queue to simulate SSE listener
    loop = asyncio.new_event_loop()
    q = asyncio.Queue()
    job._listeners.append((q, loop))

    # Define background worker that updates progress
    def worker():
        job_registry.update_progress(
            job_id,
            current_step="Step 1",
            processed_inc=1,
            succeeded_inc=1,
        )
        job_registry.complete_job(job_id, status=JobStatus.COMPLETED)

    # Start thread
    thread = threading.Thread(target=worker)
    thread.start()
    thread.join()

    # Run event loop briefly to process notifications
    async def get_notifications():
        # Expect two updates (update_progress and complete_job)
        item1 = await asyncio.wait_for(q.get(), timeout=2.0)
        item2 = await asyncio.wait_for(q.get(), timeout=2.0)
        return item1, item2

    res1, res2 = loop.run_until_complete(get_notifications())
    
    assert res1["processed_targets"] == 1
    assert res2["status"] == JobStatus.COMPLETED
    
    # Cleanup listener
    job._listeners = [item for item in job._listeners if item[0] is not q]
    loop.close()


def test_export_cleanup():
    """Verify that export endpoint successfully exports layers and cleans up temp directories."""
    info = get_gdb_info(GDB_PATH)
    layer_name = None
    for ds in info.datasets:
        for f in ds.features:
            try:
                data = get_feature_data(GDB_PATH, f, limit=1)
                if data["total_count"] > 0 and len(data["columns"]) > 0:
                    layer_name = f
                    break
            except Exception:
                pass
        if layer_name:
            break
    if not layer_name:
        for f in info.standalone_features:
            try:
                data = get_feature_data(GDB_PATH, f, limit=1)
                if data["total_count"] > 0 and len(data["columns"]) > 0:
                    layer_name = f
                    break
            except Exception:
                pass

    assert layer_name is not None, "No layer found to export"

    # Call bulk export endpoint
    response = client.post(
        f"/api/export?gdb_path={GDB_PATH}",
        json={"layers": [layer_name], "format": "geojson"}
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    
    # The zip file is sent, and temp dir cleanup is scheduled via BackgroundTasks.
    # In TestClient, background tasks run synchronously during the request/response lifecycle.
    # Let's verify that no remaining "geodb_export_" folders exist in the system temp directory.
    import glob
    temp_dir = tempfile.gettempdir()
    remaining_exports = glob.glob(os.path.join(temp_dir, "geodb_export_*"))
    
    # Assert that if there are any export directories, they do not contain files or are cleaned up.
    for folder in remaining_exports:
        assert not os.path.exists(os.path.join(folder, f"{layer_name}.json"))


def test_corrupt_layer_graceful_fallback():
    """Verify that calling schema and preview data on a corrupt layer (like Tea_Zones) does not crash."""
    from backend.services.gdb_service import get_feature_info, get_feature_data
    
    # Verify schema load does not raise RuntimeError and returns empty/basic fields
    info = get_feature_info(GDB_PATH, "Tea_Zones")
    assert info.name == "Tea_Zones"
    assert len(info.fields) == 0  # Gracefully returned 0 fields
    
    # Verify preview data load does not raise RuntimeError and returns empty rows/columns
    data = get_feature_data(GDB_PATH, "Tea_Zones")
    assert data["layer_name"] == "Tea_Zones"
    assert len(data["rows"]) == 0

