"""
jobs.py
Router for querying job status, streaming real-time progress via SSE, and cancelling jobs.
"""
import asyncio
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.services.job_service import job_registry, JobStatus

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}")
def get_job_status(job_id: str):
    info = job_registry.to_dict(job_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return info


@router.post("/{job_id}/cancel")
def cancel_job(job_id: str):
    success = job_registry.request_cancel(job_id)
    if not success:
        raise HTTPException(status_code=400, detail=f"Cannot cancel job '{job_id}' (not active or not found)")
    return {"message": f"Cancellation requested for job {job_id}"}


@router.get("/{job_id}/events")
async def job_events_sse(job_id: str):
    job = job_registry.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    async def event_generator():
        q: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_running_loop()
        job._listeners.append((q, loop))
        try:
            # Yield initial snapshot
            info = job_registry.to_dict(job_id)
            if info:
                yield f"data: {json.dumps(info)}\n\n"

            while True:
                # Poll or wait for update from queue
                try:
                    await asyncio.wait_for(q.get(), timeout=1.0)
                    full_info = job_registry.to_dict(job_id)
                    if full_info:
                        yield f"data: {json.dumps(full_info)}\n\n"
                        if full_info["status"] in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                            break
                except asyncio.TimeoutError:
                    # Periodically yield heartbeat / check status
                    full_info = job_registry.to_dict(job_id)
                    if full_info:
                        yield f"data: {json.dumps(full_info)}\n\n"
                        if full_info["status"] in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                            break
        finally:
            job._listeners = [item for item in job._listeners if item[0] is not q]

    return StreamingResponse(event_generator(), media_type="text/event-stream")
