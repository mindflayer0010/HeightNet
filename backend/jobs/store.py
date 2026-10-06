"""Small in-memory job store for the local portal prototype."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import threading
import uuid
from typing import Any, Callable


@dataclass
class Job:
    id: str
    kind: str
    status: str = "queued"
    message: str = "Waiting to start"
    result: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status,
            "message": self.message,
            "result": self.result,
            "created_at": self.created_at,
        }


class JobStore:
    """Thread-safe, process-local job status for a single-machine demo."""

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self, kind: str) -> Job:
        job = Job(id=uuid.uuid4().hex[:12], kind=kind)
        with self._lock:
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def update(
        self,
        job_id: str,
        *,
        status: str | None = None,
        message: str | None = None,
        result: dict[str, Any] | None = None,
    ) -> None:
        with self._lock:
            job = self._jobs[job_id]
            if status is not None:
                job.status = status
            if message is not None:
                job.message = message
            if result is not None:
                job.result = result

    def start(self, job: Job, worker: Callable[[], dict[str, Any]]) -> None:
        def run() -> None:
            self.update(job.id, status="running", message="Starting the job...")
            try:
                result = worker()
            except Exception as exc:  # worker errors belong in the job response
                self.update(job.id, status="failed", message=str(exc))
            else:
                # A worker may have left a useful final message such as
                # "Terrain mesh and exports are ready." Do not replace that
                # with the vague old "Finished" text.
                with self._lock:
                    current_message = self._jobs[job.id].message
                final_message = current_message if current_message != "Starting the job..." else "Finished"
                self.update(job.id, status="complete", message=final_message, result=result)

        threading.Thread(target=run, name=f"heightnet-job-{job.id}", daemon=True).start()
