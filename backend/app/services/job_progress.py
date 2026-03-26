from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from time import monotonic
from typing import Any

from ..core.store import RedisLike


JOB_PREFIX = "sparkorbit:job"
JOB_STATE_TTL_SECONDS = 15 * 60
JOB_MAX_ACTIVE_ITEMS = 6
JOB_MAX_RECENT_ITEMS = 5
JOB_HEAVY_FLUSH_INTERVAL_SECONDS = 0.25
JOB_HEAVY_FLUSH_ITEM_INTERVAL = 10

JOB_STEP_DEFINITIONS = (
    ("prepare", "Prepare"),
    ("collect", "Collect Sources"),
    ("artifacts", "Write Artifacts"),
    ("publish_docs", "Publish Docs"),
    ("publish_views", "Publish Views"),
    ("summaries", "Summaries"),
    ("labels", "LLM Labels"),
    ("digests", "Digests"),
    ("briefing", "Briefing"),
)

JOB_STAGE_LABELS = {
    "starting": "Prepare",
    "fetching_sources": "Collect Sources",
    "writing_artifacts": "Write Artifacts",
    "publishing_documents": "Publish Docs",
    "publishing_views": "Publish Views",
    "summarizing_documents": "Summaries",
    "offline_labeling": "LLM Labels",
    "building_digests": "Digests",
    "building_briefing": "Briefing",
    "ready": "Ready",
    "partial_error": "Partial Error",
    "error": "Error",
}

JOB_STAGE_RANGES = {
    "starting": (0, 5),
    "fetching_sources": (5, 60),
    "writing_artifacts": (60, 68),
    "publishing_documents": (68, 82),
    "publishing_views": (82, 88),
    "summarizing_documents": (88, 96),
    "offline_labeling": (96, 98),
    "building_digests": (98, 99),
    "building_briefing": (99, 100),
    "ready": (100, 100),
    "partial_error": (100, 100),
}

JOB_STAGE_TO_STEP_ID = {
    "starting": "prepare",
    "fetching_sources": "collect",
    "writing_artifacts": "artifacts",
    "publishing_documents": "publish_docs",
    "publishing_views": "publish_views",
    "summarizing_documents": "summaries",
    "offline_labeling": "labels",
    "building_digests": "digests",
    "building_briefing": "briefing",
}

JOB_TERMINAL_STATUSES = {"ready", "partial_error", "error"}


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00",
        "Z",
    )


def json_dumps(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def json_loads(payload: str | None) -> Any:
    if payload is None:
        return None
    return json.loads(payload)


def job_state_key(job_id: str) -> str:
    return f"{JOB_PREFIX}:{job_id}:state"


def active_job_key(surface: str) -> str:
    return f"{JOB_PREFIX}:active:{surface}"


def build_poll_path(job_id: str) -> str:
    return f"/api/jobs/{job_id}"


def build_work_item(kind: str, item_id: str, label: str | None = None) -> dict[str, str]:
    resolved_label = (label or item_id or kind).strip() or kind
    return {
        "kind": kind,
        "id": item_id,
        "label": resolved_label,
    }


def get_job_progress(store: RedisLike, job_id: str) -> dict[str, Any] | None:
    payload = json_loads(store.get(job_state_key(job_id)))
    return payload if isinstance(payload, dict) else None


def get_active_job_id(store: RedisLike, surface: str) -> str | None:
    job_id = store.get(active_job_key(surface))
    if not job_id:
        return None
    payload = get_job_progress(store, job_id)
    if payload is None or payload.get("status") in JOB_TERMINAL_STATUSES:
        store.delete(active_job_key(surface))
        return None
    return job_id


def get_active_job(store: RedisLike, surface: str) -> dict[str, Any] | None:
    job_id = get_active_job_id(store, surface)
    if not job_id:
        return None
    payload = get_job_progress(store, job_id)
    if payload is None:
        return None
    return {
        "job_id": job_id,
        "poll_path": build_poll_path(job_id),
        "surface": surface,
        "job_type": payload.get("job_type"),
        "status": payload.get("status"),
    }


def build_default_loading_snapshot(
    *,
    status: str,
    session_id: str | None = None,
    run_id: str | None = None,
    detail: str | None = None,
) -> dict[str, Any]:
    stage = {
        "published": "publishing_views",
        "summarizing": "summarizing_documents",
        "ready": "ready",
        "partial_error": "partial_error",
        "error": "error",
        "collecting": "fetching_sources",
    }.get(status, "starting")
    percent = {
        "published": 88,
        "summarizing": 88,
        "ready": 100,
        "partial_error": 100,
        "error": 0,
        "collecting": 5,
    }.get(status, 0)
    loading_status = {
        "ready": "ready",
        "partial_error": "partial_error",
        "error": "error",
    }.get(status, "running")
    steps = []
    active_step_id = JOB_STAGE_TO_STEP_ID.get(stage)
    active_index = None
    if active_step_id is not None:
        active_index = [step_id for step_id, _label in JOB_STEP_DEFINITIONS].index(
            active_step_id,
        )
    for index, (step_id, label) in enumerate(JOB_STEP_DEFINITIONS):
        step_status = "pending"
        if status in {"ready", "partial_error"}:
            step_status = "complete"
        elif status == "error" and active_index is not None and index == active_index:
            step_status = "error"
        elif active_index is not None:
            if index < active_index:
                step_status = "complete"
            elif index == active_index:
                step_status = "active"
        steps.append({"id": step_id, "label": label, "status": step_status})

    return {
        "job_id": None,
        "surface": "dashboard",
        "job_type": "session_loading",
        "status": loading_status,
        "stage": stage,
        "stage_label": JOB_STAGE_LABELS.get(stage, "Prepare"),
        "detail": detail or JOB_STAGE_LABELS.get(stage, "Prepare"),
        "percent": percent,
        "steps": steps,
        "source_counts": {"completed": 0, "total": 0, "active": 0, "error": 0, "skipped": 0},
        "document_counts": {"completed": 0, "total": 0, "error": 0},
        "task_counts": {"completed": 0, "total": 0, "error": 0},
        "current_work_item": None,
        "active_work_items": [],
        "recent_completed_items": [],
        "session_id": session_id,
        "run_id": run_id,
        "started_at": None,
        "updated_at": None,
        "finished_at": None,
        "error": None,
    }


class JobProgressTracker:
    def __init__(
        self,
        store: RedisLike,
        *,
        job_id: str,
        surface: str,
        job_type: str,
        state: dict[str, Any] | None = None,
    ) -> None:
        self.store = store
        self.job_id = job_id
        self.surface = surface
        self.job_type = job_type
        self.state = state or self._build_initial_state()
        self._step_errors: set[str] = {
            str(step.get("id"))
            for step in self.state.get("steps") or []
            if step.get("status") == "error"
        }
        self._active_items: dict[str, dict[str, str]] = {
            str(item.get("id")): item
            for item in self.state.get("active_work_items") or []
            if isinstance(item, dict) and item.get("id")
        }
        self._active_item_order = list(self._active_items)
        self._last_flush_at = 0.0
        self._last_heavy_completed: dict[str, int] = {}

    def _build_initial_state(self) -> dict[str, Any]:
        started_at = now_utc_iso()
        return {
            "job_id": self.job_id,
            "surface": self.surface,
            "job_type": self.job_type,
            "status": "queued",
            "stage": "starting",
            "stage_label": JOB_STAGE_LABELS["starting"],
            "detail": "Preparing collection run.",
            "percent": 0,
            "steps": [
                {"id": step_id, "label": label, "status": "active" if index == 0 else "pending"}
                for index, (step_id, label) in enumerate(JOB_STEP_DEFINITIONS)
            ],
            "source_counts": {"completed": 0, "total": 0, "active": 0, "error": 0, "skipped": 0},
            "document_counts": {"completed": 0, "total": 0, "error": 0},
            "task_counts": {"completed": 0, "total": 0, "error": 0},
            "current_work_item": None,
            "active_work_items": [],
            "recent_completed_items": [],
            "session_id": None,
            "run_id": None,
            "started_at": started_at,
            "updated_at": started_at,
            "finished_at": None,
            "error": None,
        }

    def snapshot(self) -> dict[str, Any]:
        return deepcopy(self.state)

    def handle_event(self, event: dict[str, Any]) -> None:
        event_type = str(event.get("type") or "").strip()
        if not event_type:
            return

        if event_type == "identity":
            self._handle_identity(event)
            self.flush(force=True)
            return
        if event_type == "stage":
            self._handle_stage(event)
            self.flush(force=bool(event.get("force")))
            return
        if event_type == "source_started":
            self._handle_source_started(event)
            self.flush(force=False)
            return
        if event_type == "source_finished":
            self._handle_source_finished(event)
            self.flush(force=True)
            return
        if event_type == "progress":
            self._handle_progress(event)
            self.flush(force=self._should_force_heavy_flush(event))
            return
        if event_type == "task_started":
            self._handle_task_started(event)
            self.flush(force=True)
            return
        if event_type == "task_finished":
            self._handle_task_finished(event)
            self.flush(force=True)
            return
        if event_type == "step_error":
            step_id = str(event.get("step_id") or "").strip()
            if step_id:
                self._step_errors.add(step_id)
                self._refresh_steps()
                self.flush(force=True)
            return
        if event_type == "terminal":
            self._handle_terminal(event)
            self.flush(force=True)

    def flush(self, *, force: bool) -> None:
        now = monotonic()
        if not force and now - self._last_flush_at < JOB_HEAVY_FLUSH_INTERVAL_SECONDS:
            return
        self.state["updated_at"] = now_utc_iso()
        self.store.set(job_state_key(self.job_id), json_dumps(self.state))
        self.store.expire(job_state_key(self.job_id), JOB_STATE_TTL_SECONDS)
        if self.state.get("status") in JOB_TERMINAL_STATUSES:
            self._clear_active_job_if_owned()
        else:
            self.store.set(active_job_key(self.surface), self.job_id)
            self.store.expire(active_job_key(self.surface), JOB_STATE_TTL_SECONDS)
        self._last_flush_at = now

    def _handle_identity(self, event: dict[str, Any]) -> None:
        if event.get("session_id") is not None:
            self.state["session_id"] = event.get("session_id")
        if event.get("run_id") is not None:
            self.state["run_id"] = event.get("run_id")

    def _handle_stage(self, event: dict[str, Any]) -> None:
        stage = str(event.get("stage") or "").strip()
        if not stage:
            return
        self.state["stage"] = stage
        self.state["stage_label"] = str(
            event.get("stage_label") or JOB_STAGE_LABELS.get(stage, "Prepare"),
        )
        if event.get("detail") is not None:
            self.state["detail"] = str(event.get("detail"))
        status = event.get("status")
        if status is not None:
            self.state["status"] = str(status)
        elif stage != "starting":
            self.state["status"] = "running"
        progress_current = event.get("progress_current")
        progress_total = event.get("progress_total")
        if progress_current is not None or progress_total is not None:
            self._set_stage_percent(stage, progress_current, progress_total)
        elif stage in JOB_STAGE_RANGES:
            self.state["percent"] = JOB_STAGE_RANGES[stage][0]

        if stage != "fetching_sources":
            self._active_items = {}
            self._active_item_order = []
            self.state["active_work_items"] = []
            if event.get("current_item") is None:
                self.state["current_work_item"] = None

        if event.get("current_item") is not None:
            self.state["current_work_item"] = deepcopy(event["current_item"])

        if event.get("reset_document_counts"):
            self.state["document_counts"] = {"completed": 0, "total": 0, "error": 0}
        if event.get("reset_task_counts"):
            self.state["task_counts"] = {"completed": 0, "total": 0, "error": 0}
        self._refresh_steps()

    def _handle_source_started(self, event: dict[str, Any]) -> None:
        source = str(event.get("source") or "").strip()
        if not source:
            return
        label = str(event.get("label") or source)
        item = build_work_item("source", source, label)
        if source not in self._active_items:
            self._active_items[source] = item
            self._active_item_order.append(source)
        total = event.get("total")
        if isinstance(total, int) and total >= 0:
            self.state["source_counts"]["total"] = total
        self.state["source_counts"]["active"] = len(self._active_item_order)
        self.state["active_work_items"] = self._ordered_active_items()
        if self._active_item_order:
            first_active = self._active_items[self._active_item_order[0]]
            self.state["current_work_item"] = deepcopy(first_active)

    def _handle_source_finished(self, event: dict[str, Any]) -> None:
        source = str(event.get("source") or "").strip()
        status = str(event.get("status") or "ok").strip()
        label = str(event.get("label") or source)
        if source in self._active_items:
            self._active_items.pop(source, None)
            self._active_item_order = [item_id for item_id in self._active_item_order if item_id != source]
        self.state["source_counts"]["completed"] += 1
        if status == "error":
            self.state["source_counts"]["error"] += 1
        elif status == "skipped":
            self.state["source_counts"]["skipped"] += 1
        self.state["source_counts"]["active"] = len(self._active_item_order)
        self.state["active_work_items"] = self._ordered_active_items()
        completed_item = build_work_item("source", source, label)
        self._push_recent_completed_item(completed_item)
        if self._active_item_order:
            first_active = self._active_items[self._active_item_order[0]]
            self.state["current_work_item"] = deepcopy(first_active)
        else:
            self.state["current_work_item"] = completed_item
        self._set_stage_percent(
            "fetching_sources",
            self.state["source_counts"]["completed"],
            self.state["source_counts"]["total"],
        )

    def _handle_progress(self, event: dict[str, Any]) -> None:
        stage = str(event.get("stage") or self.state.get("stage") or "").strip()
        count_kind = str(event.get("count_kind") or "").strip()
        completed = self._coerce_non_negative_int(event.get("completed"))
        total = self._coerce_non_negative_int(event.get("total"))
        error = self._coerce_non_negative_int(event.get("error"))

        if count_kind == "document":
            self.state["document_counts"]["completed"] = completed
            self.state["document_counts"]["total"] = total
            self.state["document_counts"]["error"] = error
        elif count_kind == "task":
            self.state["task_counts"]["completed"] = completed
            self.state["task_counts"]["total"] = total
            self.state["task_counts"]["error"] = error
        elif count_kind == "source":
            self.state["source_counts"]["completed"] = completed
            self.state["source_counts"]["total"] = total
            self.state["source_counts"]["error"] = error

        if event.get("current_item") is not None:
            self.state["current_work_item"] = deepcopy(event["current_item"])
        self._set_stage_percent(stage, completed, total)

    def _handle_task_started(self, event: dict[str, Any]) -> None:
        item = event.get("item")
        if item is not None:
            self.state["current_work_item"] = deepcopy(item)

    def _handle_task_finished(self, event: dict[str, Any]) -> None:
        item = event.get("item")
        if item is not None:
            self.state["current_work_item"] = deepcopy(item)
            self._push_recent_completed_item(item)
        if event.get("error"):
            self.state["task_counts"]["error"] = self._coerce_non_negative_int(
                event.get("task_error_total"),
            )
            step_id = str(event.get("step_id") or "").strip()
            if step_id:
                self._step_errors.add(step_id)
                self._refresh_steps()

    def _handle_terminal(self, event: dict[str, Any]) -> None:
        status = str(event.get("status") or "error")
        previous_stage = str(self.state.get("stage") or "")
        self.state["status"] = status
        self.state["stage"] = (
            status if status in {"ready", "partial_error", "error"} else previous_stage
        )
        self.state["stage_label"] = JOB_STAGE_LABELS.get(
            self.state["stage"],
            self.state.get("stage_label", "Prepare"),
        )
        if event.get("detail") is not None:
            self.state["detail"] = str(event.get("detail"))
        if event.get("error") is not None:
            self.state["error"] = deepcopy(event["error"])
        if status in {"ready", "partial_error"}:
            self.state["percent"] = 100
        step_id = JOB_STAGE_TO_STEP_ID.get(previous_stage)
        if status == "error" and step_id:
            self._step_errors.add(step_id)
        if status == "partial_error" and event.get("step_id"):
            self._step_errors.add(str(event["step_id"]))
        self.state["finished_at"] = now_utc_iso()
        self._active_items = {}
        self._active_item_order = []
        self.state["active_work_items"] = []
        self._refresh_steps()

    def _set_stage_percent(
        self,
        stage: str,
        progress_current: Any,
        progress_total: Any,
    ) -> None:
        if stage == "error":
            return
        if stage in {"ready", "partial_error"}:
            self.state["percent"] = 100
            return
        start, end = JOB_STAGE_RANGES.get(stage, (0, 0))
        total = self._coerce_non_negative_int(progress_total)
        current = self._coerce_non_negative_int(progress_current)
        if total <= 0:
            self.state["percent"] = start
            return
        ratio = min(max(current / total, 0.0), 1.0)
        self.state["percent"] = int(round(start + ((end - start) * ratio)))

    def _ordered_active_items(self) -> list[dict[str, str]]:
        return [
            deepcopy(self._active_items[item_id])
            for item_id in self._active_item_order[:JOB_MAX_ACTIVE_ITEMS]
            if item_id in self._active_items
        ]

    def _push_recent_completed_item(self, item: dict[str, Any]) -> None:
        if not isinstance(item, dict):
            return
        normalized = {
            "kind": str(item.get("kind") or "task"),
            "id": str(item.get("id") or ""),
            "label": str(item.get("label") or item.get("id") or ""),
        }
        if not normalized["id"]:
            return
        recent_items = [
            existing
            for existing in self.state.get("recent_completed_items") or []
            if isinstance(existing, dict) and str(existing.get("id") or "") != normalized["id"]
        ]
        self.state["recent_completed_items"] = [
            normalized,
            *recent_items[: JOB_MAX_RECENT_ITEMS - 1],
        ]

    def _refresh_steps(self) -> None:
        active_step_id = JOB_STAGE_TO_STEP_ID.get(str(self.state.get("stage") or ""))
        status = str(self.state.get("status") or "queued")
        active_index = None
        if active_step_id is not None:
            active_index = [step_id for step_id, _label in JOB_STEP_DEFINITIONS].index(
                active_step_id,
            )

        resolved_steps = []
        for index, (step_id, label) in enumerate(JOB_STEP_DEFINITIONS):
            step_status = "pending"
            if status in {"ready", "partial_error"}:
                step_status = "complete"
            elif active_index is not None:
                if index < active_index:
                    step_status = "complete"
                elif index == active_index:
                    step_status = "active"
            if step_id in self._step_errors:
                step_status = "error"
            if status == "error" and active_index is not None and index == active_index:
                step_status = "error"
            resolved_steps.append({"id": step_id, "label": label, "status": step_status})
        self.state["steps"] = resolved_steps

    def _should_force_heavy_flush(self, event: dict[str, Any]) -> bool:
        stage = str(event.get("stage") or "").strip()
        completed = self._coerce_non_negative_int(event.get("completed"))
        total = self._coerce_non_negative_int(event.get("total"))
        last_completed = self._last_heavy_completed.get(stage, 0)
        self._last_heavy_completed[stage] = completed
        if total > 0 and completed >= total:
            return True
        if completed // JOB_HEAVY_FLUSH_ITEM_INTERVAL > last_completed // JOB_HEAVY_FLUSH_ITEM_INTERVAL:
            return True
        return False

    def _clear_active_job_if_owned(self) -> None:
        active_key = active_job_key(self.surface)
        if self.store.get(active_key) == self.job_id:
            self.store.delete(active_key)

    @staticmethod
    def _coerce_non_negative_int(value: Any) -> int:
        if isinstance(value, bool):
            return 0
        if isinstance(value, int):
            return max(0, value)
        if isinstance(value, float):
            return max(0, int(value))
        if isinstance(value, str):
            try:
                return max(0, int(float(value)))
            except ValueError:
                return 0
        return 0


def get_or_create_job_tracker(
    store: RedisLike,
    *,
    job_id: str,
    surface: str,
    job_type: str,
) -> JobProgressTracker:
    state = get_job_progress(store, job_id)
    tracker = JobProgressTracker(
        store,
        job_id=job_id,
        surface=surface,
        job_type=job_type,
        state=state,
    )
    if state is None:
        tracker.flush(force=True)
    return tracker
