from __future__ import annotations

from pydantic import BaseModel


class JobProgressStep(BaseModel):
    id: str
    label: str
    status: str


class JobProgressCounts(BaseModel):
    completed: int
    total: int
    error: int = 0


class JobProgressSourceCounts(JobProgressCounts):
    active: int
    skipped: int = 0


class JobProgressWorkItem(BaseModel):
    kind: str
    id: str
    label: str


class JobProgressError(BaseModel):
    message: str
    type: str | None = None


class JobProgressResponse(BaseModel):
    job_id: str
    surface: str
    job_type: str
    status: str
    stage: str
    stage_label: str
    detail: str
    percent: int
    steps: list[JobProgressStep]
    source_counts: JobProgressSourceCounts
    document_counts: JobProgressCounts
    task_counts: JobProgressCounts
    current_work_item: JobProgressWorkItem | None = None
    active_work_items: list[JobProgressWorkItem]
    recent_completed_items: list[JobProgressWorkItem]
    session_id: str | None = None
    run_id: str | None = None
    started_at: str | None = None
    updated_at: str | None = None
    finished_at: str | None = None
    error: JobProgressError | None = None


class ActiveJobResponse(BaseModel):
    job_id: str
    poll_path: str
    surface: str
    job_type: str | None = None
    status: str | None = None
