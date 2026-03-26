from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class SourceConfig:
    name: str
    category: str
    method: str
    endpoint: str
    doc_type: str
    parser: str
    default_tags: tuple[str, ...] = ()
    extra: dict[str, Any] = field(default_factory=dict)
    default_limit: int | None = None
    max_age_days: int | None = None


@dataclass
class RawResponse:
    filename: str
    body: bytes


@dataclass
class FetchResult:
    source: str
    endpoint: str
    raw_responses: list[RawResponse] = field(default_factory=list)
    raw_items: list[dict[str, Any]] = field(default_factory=list)
    documents: list[dict[str, Any]] = field(default_factory=list)
    metrics: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    request_traces: list[dict[str, Any]] = field(default_factory=list)
