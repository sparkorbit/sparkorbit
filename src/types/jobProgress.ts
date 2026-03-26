export type JobProgressStatus =
  | "queued"
  | "running"
  | "ready"
  | "partial_error"
  | "error";

export type JobProgressStepStatus =
  | "pending"
  | "active"
  | "complete"
  | "error";

export type JobProgressStep = {
  id: string;
  label: string;
  status: JobProgressStepStatus | string;
};

export type JobProgressCounts = {
  completed: number;
  total: number;
  error: number;
};

export type JobProgressSourceCounts = JobProgressCounts & {
  active: number;
  skipped: number;
};

export type JobProgressWorkItem = {
  kind: string;
  id: string;
  label: string;
};

export type JobProgressError = {
  message: string;
  type?: string | null;
};

export type JobProgressSnapshot = {
  job_id: string | null;
  surface: string;
  job_type: string;
  status: JobProgressStatus | string;
  stage: string;
  stage_label: string;
  detail: string;
  percent: number;
  steps: JobProgressStep[];
  source_counts: JobProgressSourceCounts;
  document_counts: JobProgressCounts;
  task_counts: JobProgressCounts;
  current_work_item: JobProgressWorkItem | null;
  active_work_items: JobProgressWorkItem[];
  recent_completed_items: JobProgressWorkItem[];
  session_id: string | null;
  run_id: string | null;
  started_at: string | null;
  updated_at: string | null;
  finished_at: string | null;
  error: JobProgressError | null;
};

export type ActiveJobResponse = {
  job_id: string;
  poll_path: string;
  surface: string;
  job_type?: string | null;
  status?: JobProgressStatus | string | null;
};
