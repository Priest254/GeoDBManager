"""
job_service.py
In-memory background job manager for bulk operations and compute tasks.
Tracks progress, logs, status, and supports cancellation & SSE streaming.
"""
import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import threading


@dataclass
class JobLog:
    timestamp: str
    level: str  # "info", "success", "warning", "error"
    message: str


class JobStatus:
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Job:
    job_id: str
    operation: str
    status: str = JobStatus.QUEUED
    progress_percent: float = 0.0
    current_step: str = "Initializing..."
    total_targets: int = 0
    processed_targets: int = 0
    succeeded_count: int = 0
    failed_count: int = 0
    results: List[Dict[str, Any]] = field(default_factory=list)
    logs: List[JobLog] = field(default_factory=list)
    start_time: float = field(default_factory=time.time)
    end_time: Optional[float] = None
    cancel_requested: bool = False
    _listeners: List[asyncio.Queue] = field(default_factory=list)


class JobRegistry:
    def __init__(self):
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.Lock()

    def create_job(self, operation: str, total_targets: int = 0) -> Job:
        job_id = str(uuid.uuid4())
        job = Job(
            job_id=job_id,
            operation=operation,
            total_targets=total_targets,
            start_time=time.time(),
        )
        with self._lock:
            self._jobs[job_id] = job
        self.add_log(job_id, "info", f"Started bulk task '{operation}' with {total_targets} target(s).")
        return job

    def get_job(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def add_log(self, job_id: str, level: str, message: str):
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            ts = time.strftime("%H:%M:%S")
            log_entry = JobLog(timestamp=ts, level=level, message=message)
            job.logs.append(log_entry)
            self._notify_listeners(job)

    def update_progress(
        self,
        job_id: str,
        current_step: str,
        processed_inc: int = 0,
        succeeded_inc: int = 0,
        failed_inc: int = 0,
        result: Optional[Dict[str, Any]] = None,
    ):
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return

            if job.status == JobStatus.QUEUED:
                job.status = JobStatus.RUNNING

            job.current_step = current_step
            job.processed_targets += processed_inc
            job.succeeded_count += succeeded_inc
            job.failed_count += failed_inc

            if result:
                job.results.append(result)

            if job.total_targets > 0:
                job.progress_percent = round(min(100.0, (job.processed_targets / job.total_targets) * 100.0), 1)

            self._notify_listeners(job)

    def request_cancel(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            if job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                return False
            job.cancel_requested = True
            job.status = JobStatus.CANCELLED
            job.end_time = time.time()
        self.add_log(job_id, "warning", "Cancellation requested by user.")
        return True

    def is_cancelled(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            return job.cancel_requested if job else False

    def complete_job(self, job_id: str, status: str = JobStatus.COMPLETED, message: Optional[str] = None):
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.status = status
            job.end_time = time.time()
            job.progress_percent = 100.0 if status == JobStatus.COMPLETED else job.progress_percent

        level = "success" if status == JobStatus.COMPLETED else ("warning" if status == JobStatus.CANCELLED else "error")
        msg = message or f"Task finished with status '{status}' ({job.succeeded_count} succeeded, {job.failed_count} failed)."
        self.add_log(job_id, level, msg)

    def to_dict(self, job_id: str) -> Optional[Dict[str, Any]]:
        job = self.get_job(job_id)
        if not job:
            return None
        with self._lock:
            elapsed = round((job.end_time or time.time()) - job.start_time, 2)
            eta = None
            if job.status == JobStatus.RUNNING and job.progress_percent > 0 and job.progress_percent < 100:
                rate = job.processed_targets / max(0.1, elapsed)
                rem = job.total_targets - job.processed_targets
                eta = round(rem / max(0.01, rate), 1)

            return {
                "job_id": job.job_id,
                "operation": job.operation,
                "status": job.status,
                "progress_percent": job.progress_percent,
                "current_step": job.current_step,
                "total_targets": job.total_targets,
                "processed_targets": job.processed_targets,
                "succeeded_count": job.succeeded_count,
                "failed_count": job.failed_count,
                "elapsed_seconds": elapsed,
                "eta_seconds": eta,
                "cancel_requested": job.cancel_requested,
                "logs": [{"timestamp": entry.timestamp, "level": entry.level, "message": entry.message} for entry in job.logs],
                "results": job.results,
            }

    def _notify_listeners(self, job: Job):
        # Notify any async SSE listeners waiting on queue
        data = {
            "job_id": job.job_id,
            "status": job.status,
            "progress_percent": job.progress_percent,
            "current_step": job.current_step,
            "processed_targets": job.processed_targets,
            "total_targets": job.total_targets,
            "succeeded_count": job.succeeded_count,
            "failed_count": job.failed_count,
        }
        for q, loop in list(job._listeners):
            try:
                loop.call_soon_threadsafe(q.put_nowait, data)
            except Exception:
                pass


# Global singleton instance
job_registry = JobRegistry()
