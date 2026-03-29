from __future__ import annotations

import html as html_lib
import hashlib
import json
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from time import perf_counter
from typing import Any
from urllib.parse import urljoin, urlparse

import feedparser
import httpx
from bs4 import BeautifulSoup

from source_fetch.models import FetchResult, RawResponse, SourceConfig


DEFAULT_TIMEOUT = 30.0
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept": "application/json, application/xml, text/xml, application/rss+xml, text/html;q=0.9, */*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def make_client(timeout: float = DEFAULT_TIMEOUT) -> httpx.Client:
    return httpx.Client(
        timeout=timeout,
        follow_redirects=True,
        headers=DEFAULT_HEADERS,
    )


def timed_request(
    result: FetchResult,
    client: httpx.Client,
    method: str,
    url: str,
    *,
    request_name: str,
    **kwargs: Any,
) -> httpx.Response:
    started_at = perf_counter()
    try:
        response = client.request(method, url, **kwargs)
    except Exception as exc:
        duration_ms = int((perf_counter() - started_at) * 1000)
        result.request_traces.append(
            {
                "request_name": request_name,
                "method": method.upper(),
                "url": url,
                "status_code": None,
                "duration_ms": duration_ms,
                "content_bytes": None,
                "ok": False,
                "error_type": type(exc).__name__,
                "error_message": str(exc),
            }
        )
        raise

    duration_ms = int((perf_counter() - started_at) * 1000)
    result.request_traces.append(
        {
            "request_name": request_name,
            "method": method.upper(),
            "url": str(response.request.url),
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "content_bytes": len(response.content),
            "ok": response.is_success,
            "error_type": None,
            "error_message": None,
        }
    )
    return response


def to_jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_jsonable(v) for v in value]
    if isinstance(value, tuple):
        return [to_jsonable(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def clean_html(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(BeautifulSoup(value, "html.parser").get_text(" ", strip=True).split())


def normalize_space(value: str | None) -> str:
    return " ".join(html_lib.unescape(value or "").split())


def normalize_text_value(value: str | None) -> str:
    if not value:
        return ""
    text = value or ""
    if "<" in text and ">" in text:
        cleaned = clean_html(text)
        if cleaned:
            return cleaned
    return normalize_space(text)


def resolve_absolute_url(base_url: str, value: str | None) -> str | None:
    candidate = normalize_space(value)
    if not candidate:
        return None
    if candidate.startswith(("http://", "https://")):
        return candidate
    return urljoin(base_url, candidate)


def parse_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.lower().startswith("on "):
            stripped = stripped[3:].strip()
        if not stripped:
            return None
        for fmt in ("%B %d, %Y", "%b %d, %Y", "%Y.%m.%d", "%Y-%m-%d", "%Y/%m/%d", "%m/%d/%y", "%m/%d/%Y"):
            try:
                return datetime.strptime(stripped, fmt).replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
            except ValueError:
                pass
        try:
            return datetime.fromisoformat(stripped.replace("Z", "+00:00")).astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        except ValueError:
            pass
        try:
            return parsedate_to_datetime(stripped).astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        except (TypeError, ValueError):
            return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if hasattr(value, "tm_year"):
        try:
            dt = datetime(
                value.tm_year,
                value.tm_mon,
                value.tm_mday,
                value.tm_hour,
                value.tm_min,
                value.tm_sec,
                tzinfo=timezone.utc,
            )
            return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")
        except Exception:
            return None
    return None


DATE_PATTERNS = [
    re.compile(r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b"),
    re.compile(r"\b\d{4}[/-]\d{2}[/-]\d{2}\b"),
    re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b"),
]


def extract_date_from_text(value: str | None) -> str | None:
    text = normalize_space(value)
    if not text:
        return None
    for pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if match:
            parsed = parse_date(match.group(0))
            if parsed:
                return parsed
    return None


def extract_domain(value: str | None) -> str | None:
    if not value:
        return None
    try:
        domain = urlparse(value).netloc.lower()
    except Exception:
        return None
    return domain or None


def stable_id(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, (int, float)):
            return str(value)
    digest = hashlib.sha1(json.dumps([to_jsonable(v) for v in values]).encode("utf-8")).hexdigest()
    return digest


def entry_link(entry: Any) -> str | None:
    links = entry.get("links") or []
    for link in links:
        if link.get("rel") == "alternate" and link.get("href"):
            return link.get("href")
    return entry.get("link")


def entry_authors(entry: Any) -> list[str]:
    names: list[str] = []
    for author in entry.get("authors", []) or []:
        if isinstance(author, dict):
            candidate = author.get("name") or author.get("email")
        else:
            candidate = str(author)
        normalized = normalize_space(candidate)
        if normalized and normalized not in names:
            names.append(normalized)
    fallback = normalize_space(entry.get("author"))
    if fallback and fallback not in names:
        names.append(fallback)
    return names


def entry_media_urls(entry: Any) -> list[str]:
    urls: list[str] = []
    for item in entry.get("media_thumbnail", []) or []:
        if isinstance(item, dict):
            candidate = normalize_space(item.get("url"))
            if candidate and candidate not in urls:
                urls.append(candidate)
    gd_image = entry.get("gd_image")
    if isinstance(gd_image, dict):
        for key in ("src", "url", "href"):
            candidate = normalize_space(gd_image.get(key))
            if candidate and candidate not in urls:
                urls.append(candidate)
    return urls


def extract_arxiv_id(*values: Any) -> str | None:
    for value in values:
        if not value:
            continue
        text = str(value)
        match = re.search(r"arxiv\.org/(?:abs|pdf)/([^/?#]+)", text)
        if match:
            return normalize_space(match.group(1))
        match = re.search(r"arxiv[:/ ]([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)", text, re.I)
        if match:
            return normalize_space(match.group(1))
    return None


_ARXIV_RSS_ABSTRACT_PREFIX_PATTERNS = (
    re.compile(
        r"^\s*(?:arXiv:\s*[0-9]{4}\.[0-9]{4,5}(?:v\d+)?\s+)?Announce Type:\s*[^\n]*?\s+Abstract:\s*",
        re.I,
    ),
    re.compile(r"^\s*Abstract:\s*", re.I),
)


def strip_arxiv_rss_abstract_boilerplate(value: str | None) -> str | None:
    text = normalize_text_value(value)
    if not text:
        return None
    cleaned = text
    for pattern in _ARXIV_RSS_ABSTRACT_PREFIX_PATTERNS:
        cleaned = pattern.sub("", cleaned, count=1)
    cleaned = cleaned.strip()
    return cleaned or None


def prefixed_tag_values(tags: list[str], prefix: str) -> list[str]:
    values: list[str] = []
    for tag in tags:
        if not isinstance(tag, str) or not tag.startswith(prefix):
            continue
        value = normalize_space(tag.split(":", 1)[1])
        if value and value not in values:
            values.append(value)
    return values


def extract_name_list(values: Any, *, key_candidates: tuple[str, ...] = ("name", "fullname", "nm")) -> list[str]:
    names: list[str] = []
    if not isinstance(values, list):
        return names
    for value in values:
        candidate = None
        if isinstance(value, str):
            candidate = value
        elif isinstance(value, dict):
            for key in key_candidates:
                raw = value.get(key)
                if isinstance(raw, str) and raw.strip():
                    candidate = raw
                    break
        normalized = normalize_space(candidate)
        if normalized and normalized not in names:
            names.append(normalized)
    return names


def extract_links_from_html_fragment(value: str | None) -> list[str]:
    if not value:
        return []
    soup = BeautifulSoup(value, "html.parser")
    urls: list[str] = []
    for anchor in soup.find_all("a", href=True):
        href = normalize_space(anchor.get("href"))
        if href and href not in urls:
            urls.append(href)
    return urls


def meta_content(soup: BeautifulSoup, *selectors: tuple[str, str]) -> str | None:
    for attr_name, attr_value in selectors:
        tag = soup.find("meta", attrs={attr_name: attr_value})
        if tag and tag.get("content"):
            return normalize_space(tag.get("content"))
    return None


def iter_ld_objects(soup: BeautifulSoup) -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = script.string or script.get_text()
        if not raw:
            continue
        try:
            payload = json.loads(raw)
        except Exception:
            continue
        stack = payload if isinstance(payload, list) else [payload]
        while stack:
            current = stack.pop()
            if isinstance(current, dict):
                objects.append(current)
                graph = current.get("@graph")
                if isinstance(graph, list):
                    stack.extend(graph)
            elif isinstance(current, list):
                stack.extend(current)
    return objects


def ld_value(objects: list[dict[str, Any]], *keys: str) -> str | None:
    for obj in objects:
        for key in keys:
            value = obj.get(key)
            if isinstance(value, str) and value.strip():
                return normalize_space(value)
            if isinstance(value, dict):
                name = value.get("name")
                if isinstance(name, str) and name.strip():
                    return normalize_space(name)
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, str) and item.strip():
                        return normalize_space(item)
                    if isinstance(item, dict):
                        name = item.get("name")
                        if isinstance(name, str) and name.strip():
                            return normalize_space(name)
    return None


def collect_container_text_chunks(container: Any) -> list[str]:
    chunks: list[str] = []
    seen: set[str] = set()
    for node in container.find_all(["h1", "h2", "h3", "p", "li", "blockquote"]):
        text = normalize_space(node.get_text(" ", strip=True))
        if text and text not in seen:
            chunks.append(text)
            seen.add(text)
    if chunks:
        return chunks
    text = normalize_space(container.get_text(" ", strip=True))
    if text:
        return [text]
    return []


def extract_body_text(
    soup: BeautifulSoup,
    content_selectors: list[str] | tuple[str, ...] | None = None,
) -> str:
    if content_selectors:
        selector_chunks: list[str] = []
        selector_seen: set[str] = set()
        for selector in content_selectors:
            try:
                containers = soup.select(selector)
            except Exception:
                continue
            for container in containers:
                for chunk in collect_container_text_chunks(container):
                    if chunk in selector_seen:
                        continue
                    selector_chunks.append(chunk)
                    selector_seen.add(chunk)
        if selector_chunks:
            return " ".join(selector_chunks)

    for container in (
        soup.find("article"),
        soup.find("main"),
        soup.find(attrs={"role": "main"}),
        soup.find(class_=re.compile(r"(article|content|post|prose|markdown)", re.I)),
    ):
        if not container:
            continue
        chunks = collect_container_text_chunks(container)
        if chunks:
            return " ".join(chunks)
    return ""


def extract_detail_fields(
    soup: BeautifulSoup,
    fallback_title: str | None,
    fallback_date: str | None,
    body_selectors: list[str] | tuple[str, ...] | None = None,
) -> dict[str, Any]:
    ld_objects = iter_ld_objects(soup)
    h1 = soup.find("h1")
    title = (
        meta_content(soup, ("property", "og:title"), ("name", "twitter:title"))
        or ld_value(ld_objects, "headline", "name")
        or (normalize_space(h1.get_text(" ", strip=True)) if h1 else None)
    )
    if not title:
        title_tag = soup.find("title")
        title = normalize_space(title_tag.get_text(" ", strip=True)) if title_tag else None
    description = (
        meta_content(soup, ("property", "og:description"), ("name", "description"), ("name", "twitter:description"))
        or ld_value(ld_objects, "description")
    )
    author = (
        meta_content(soup, ("name", "author"))
        or ld_value(ld_objects, "author")
    )
    published_at = (
        meta_content(
            soup,
            ("property", "article:published_time"),
            ("property", "og:published_time"),
            ("name", "article:published_time"),
            ("itemprop", "datePublished"),
            ("name", "date"),
            ("name", "publish_date"),
        )
        or ld_value(ld_objects, "datePublished", "dateCreated")
    )
    if not published_at:
        time_tag = soup.find("time")
        if time_tag:
            published_at = time_tag.get("datetime") or time_tag.get_text(" ", strip=True)
    updated_at = (
        meta_content(
            soup,
            ("property", "article:modified_time"),
            ("property", "og:updated_time"),
            ("name", "lastmod"),
            ("itemprop", "dateModified"),
        )
        or ld_value(ld_objects, "dateModified")
    )
    canonical_url = None
    canonical_tag = soup.find("link", attrs={"rel": lambda value: value and "canonical" in value})
    if canonical_tag and canonical_tag.get("href"):
        canonical_url = normalize_space(canonical_tag.get("href"))
    hero_image_url = meta_content(soup, ("property", "og:image"), ("name", "twitter:image"))
    parsed_published_at = parse_date(published_at) or fallback_date
    body_text = extract_body_text(soup, body_selectors)
    return {
        "title": normalize_space(title) or fallback_title,
        "description": description,
        "author": author,
        "published_at": parsed_published_at,
        "updated_at": parse_date(updated_at),
        "canonical_url": canonical_url,
        "hero_image_url": hero_image_url,
        "body_text": body_text,
        "ld_object_count": len(ld_objects),
    }


def collect_html_candidates(config: SourceConfig, html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    base_url = config.extra.get("base_url", config.endpoint)
    include_prefixes = tuple(config.extra.get("include_prefixes", []))
    include_contains = tuple(config.extra.get("include_contains", []))
    exclude_exact = {urljoin(base_url, item) for item in config.extra.get("exclude_exact", [])}
    exclude_exact.add(base_url.rstrip("/"))
    exclude_exact.add(f"{base_url.rstrip('/')}/")

    collected: dict[str, dict[str, Any]] = {}
    for anchor in soup.find_all("a", href=True):
        href = normalize_space(anchor.get("href"))
        if not href or href.startswith("#") or href.startswith("mailto:") or href.startswith("javascript:"):
            continue
        absolute_url = urljoin(base_url, href).split("#", 1)[0]
        if absolute_url in exclude_exact:
            continue
        if include_prefixes and not any(href.startswith(prefix) for prefix in include_prefixes):
            if include_contains and not any(token in absolute_url or token in href for token in include_contains):
                continue
            if not include_contains:
                continue
        if include_contains and not any(token in absolute_url or token in href for token in include_contains):
            if not include_prefixes:
                continue
        title_hint = normalize_space(anchor.get_text(" ", strip=True))
        context_text = normalize_space(anchor.parent.get_text(" ", strip=True)) if anchor.parent else title_hint
        candidate = {
            "url": absolute_url,
            "title_hint": title_hint or None,
            "context_hint": context_text or None,
            "published_at_hint": extract_date_from_text(context_text or title_hint),
        }
        existing = collected.get(absolute_url)
        if not existing or len(candidate.get("context_hint") or "") > len(existing.get("context_hint") or ""):
            collected[absolute_url] = candidate
    return list(collected.values())


def extract_deepseek_slug_date(url: str | None) -> str | None:
    if not url:
        return None
    match = re.search(r"/news/news(\d{2})(\d{2})(\d{2})", url)
    if not match:
        return None
    year, month, day = match.groups()
    return parse_date(f"20{year}-{month}-{day}")


def build_summary_input(title: str | None, description: str | None, body_text: str | None, max_chars: int = 8000) -> str:
    chunks: list[str] = []
    seen: set[str] = set()
    for part in (title, description, body_text):
        text = normalize_text_value(part)
        if not text or text in seen:
            continue
        chunks.append(text)
        seen.add(text)
    joined = "\n\n".join(chunks)
    if len(joined) <= max_chars:
        return joined
    return joined[: max_chars - 1].rstrip() + "…"


def pick_primary_engagement(engagement: dict[str, Any]) -> dict[str, Any]:
    for key in ("score", "upvotes", "likes", "stars", "votes", "downloads", "comments", "read_count"):
        value = engagement.get(key)
        if isinstance(value, (int, float)):
            return {"name": key, "value": value}
    return {"name": None, "value": None}


def infer_text_scope(doc_type: str, body_text: str | None, content_format: str) -> str:
    text = normalize_space(body_text)
    if not text:
        return "empty"
    if content_format != "plain_text":
        return "excerpt"
    if doc_type == "benchmark_panel":
        return "generated_panel"
    if doc_type == "benchmark":
        return "metric_summary"
    if doc_type == "paper":
        return "abstract"
    if doc_type in {"repo", "model", "model_trending"}:
        return "metadata_only"
    if len(text) < 240:
        return "excerpt"
    return "full_text"


def default_llm_placeholder() -> dict[str, Any]:
    return {
        "status": "pending",
        "summary_1l": None,
        "summary_short": None,
        "key_points": [],
        "entities": [],
        "primary_domain": None,
        "subdomains": [],
        "importance_score": None,
        "importance_reason": None,
        "evidence_chunk_ids": [],
        "run_meta": {
            "model_name": None,
            "prompt_version": None,
            "fewshot_pack_version": None,
            "generated_at": None,
        },
    }


def default_benchmark_placeholder() -> dict[str, Any]:
    return {
        "kind": None,
        "board_id": None,
        "board_name": None,
        "snapshot_at": None,
        "rank": None,
        "score_label": None,
        "score_value": None,
        "score_unit": None,
        "votes": None,
        "model_name": None,
        "organization": None,
        "total_models": None,
        "total_votes": None,
    }


def make_document(
    *,
    run_id: str,
    source: str,
    source_item_id: str,
    doc_type: str,
    title: str,
    url: str | None,
    author: str | None,
    published_at: str | None,
    body_text: str | None,
    tags: list[str],
    engagement: dict[str, Any],
    metadata: dict[str, Any],
    raw_ref: dict[str, Any],
    fetched_at: str,
    description: str | None = None,
    authors: list[str] | None = None,
    canonical_url: str | None = None,
    reference_url: str | None = None,
    source_category: str | None = None,
    source_method: str | None = None,
    source_endpoint: str | None = None,
    updated_at: str | None = None,
    sort_at: str | None = None,
    time_semantics: str | None = None,
    language: str | None = None,
    external_ids: dict[str, Any] | None = None,
    related_urls: list[str] | None = None,
    summary_input_text: str | None = None,
    content_format: str = "plain_text",
    content_type: str | None = None,
    text_scope: str | None = None,
    benchmark: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_description = normalize_text_value(description) or None
    normalized_authors = [normalize_space(name) for name in (authors or []) if normalize_space(name)]
    if not normalized_authors and author:
        normalized_authors = [author]
    normalized_tags: list[str] = []
    for candidate in [source_category, source, doc_type, content_type, *(tags or [])]:
        normalized = normalize_space(candidate)
        if normalized and normalized not in normalized_tags:
            normalized_tags.append(normalized)
    resolved_canonical_url = canonical_url or url
    resolved_reference_url = reference_url or resolved_canonical_url or url
    resolved_sort_at = sort_at or updated_at or published_at or fetched_at
    resolved_time_semantics = time_semantics or ("published" if published_at else "observed")
    resolved_summary_input = summary_input_text or build_summary_input(title, normalized_description, body_text)
    resolved_text_scope = text_scope or infer_text_scope(doc_type, body_text, content_format)
    resolved_content_type = content_type or doc_type
    normalized_raw_ref = {"fetch_id": None, "line_index": None, "response_file": None}
    normalized_raw_ref.update(raw_ref or {})
    reference_snippet = normalized_description or normalize_space(body_text)[:280] or None
    engagement_primary = pick_primary_engagement(engagement)
    normalized_benchmark = default_benchmark_placeholder()
    normalized_benchmark.update(benchmark or {})
    return {
        "document_id": f"{source}:{source_item_id}",
        "run_id": run_id,
        "source": source,
        "source_category": source_category,
        "source_method": source_method,
        "source_endpoint": source_endpoint,
        "source_item_id": source_item_id,
        "doc_type": doc_type,
        "content_type": resolved_content_type,
        "text_scope": resolved_text_scope,
        "title": title,
        "description": normalized_description,
        "url": url,
        "canonical_url": resolved_canonical_url,
        "reference_url": resolved_reference_url,
        "author": author,
        "authors": normalized_authors,
        "published_at": published_at,
        "updated_at": updated_at,
        "sort_at": resolved_sort_at,
        "time_semantics": resolved_time_semantics,
        "timestamp_kind": resolved_time_semantics,
        "body_text": body_text,
        "summary_input_text": resolved_summary_input,
        "language": language,
        "content_format": content_format,
        "external_ids": external_ids or {},
        "related_urls": related_urls or [],
        "tags": normalized_tags,
        "engagement": engagement,
        "engagement_primary": engagement_primary,
        "benchmark": normalized_benchmark,
        "reference": {
            "source_label": source,
            "display_title": title,
            "display_url": resolved_reference_url,
            "snippet": reference_snippet,
        },
        "llm": default_llm_placeholder(),
        "metadata": metadata,
        "raw_ref": normalized_raw_ref,
        "fetched_at": fetched_at,
    }


def make_metric(
    *,
    run_id: str,
    source: str,
    source_item_id: str,
    metric_name: str,
    metric_value: Any,
    observed_at: str,
    metadata: dict[str, Any] | None = None,
    metric_label: str | None = None,
    metric_unit: str | None = None,
    metric_kind: str = "gauge",
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "source": source,
        "source_item_id": source_item_id,
        "metric_name": metric_name,
        "metric_key": metric_name,
        "metric_label": metric_label or metric_name,
        "metric_unit": metric_unit,
        "metric_kind": metric_kind,
        "metric_value": metric_value,
        "observed_at": observed_at,
        "metadata": metadata or {},
    }


def wrap_raw_item(
    *,
    source: str,
    source_item_id: str,
    fetch_id: str,
    fetched_at: str,
    payload: Any,
) -> dict[str, Any]:
    return {
        "source": source,
        "source_item_id": source_item_id,
        "fetch_id": fetch_id,
        "fetched_at": fetched_at,
        "payload": to_jsonable(payload),
    }


DEFAULT_SOURCE_LIMIT = 20
HIGH_VOLUME_SOURCE_LIMIT = 16
PAPER_DAILY_LIMIT = 50
LOW_SIGNAL_COMMUNITY_LIMIT = 10
GITHUB_WATCHLIST_LIMIT = 10
COMPANY_MAX_AGE_DAYS = 90


RSS_SOURCES: list[SourceConfig] = [
    SourceConfig("arxiv_rss_cs_ai", "papers", "rss", "https://rss.arxiv.org/rss/cs.AI", "paper", "rss", ("paper", "arxiv", "cs.AI"), default_limit=HIGH_VOLUME_SOURCE_LIMIT),
    SourceConfig("arxiv_rss_cs_lg", "papers", "rss", "https://rss.arxiv.org/rss/cs.LG", "paper", "rss", ("paper", "arxiv", "cs.LG"), default_limit=HIGH_VOLUME_SOURCE_LIMIT),
    SourceConfig("arxiv_rss_cs_cl", "papers", "rss", "https://rss.arxiv.org/rss/cs.CL", "paper", "rss", ("paper", "arxiv", "cs.CL"), default_limit=HIGH_VOLUME_SOURCE_LIMIT),
    SourceConfig("arxiv_rss_cs_cv", "papers", "rss", "https://rss.arxiv.org/rss/cs.CV", "paper", "rss", ("paper", "arxiv", "cs.CV"), default_limit=HIGH_VOLUME_SOURCE_LIMIT),
    SourceConfig("arxiv_rss_cs_ro", "papers", "rss", "https://rss.arxiv.org/rss/cs.RO", "paper", "rss", ("paper", "arxiv", "cs.RO"), default_limit=HIGH_VOLUME_SOURCE_LIMIT),
    SourceConfig("arxiv_rss_cs_ir", "papers", "rss", "https://rss.arxiv.org/rss/cs.IR", "paper", "rss", ("paper", "arxiv", "cs.IR"), default_limit=HIGH_VOLUME_SOURCE_LIMIT),
    SourceConfig("arxiv_rss_cs_cr", "papers", "rss", "https://rss.arxiv.org/rss/cs.CR", "paper", "rss", ("paper", "arxiv", "cs.CR"), default_limit=HIGH_VOLUME_SOURCE_LIMIT),
    SourceConfig("arxiv_rss_stat_ml", "papers", "rss", "https://rss.arxiv.org/rss/stat.ML", "paper", "rss", ("paper", "arxiv", "stat.ML"), default_limit=HIGH_VOLUME_SOURCE_LIMIT),
    SourceConfig("openai_news_rss", "company", "rss", "https://openai.com/news/rss.xml", "blog", "rss", ("company", "openai"), default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS),
    SourceConfig("google_ai_blog", "company", "rss", "https://blog.google/technology/ai/rss/", "blog", "rss", ("company", "google"), default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS),
    SourceConfig("microsoft_research", "company", "rss", "https://www.microsoft.com/en-us/research/feed/", "blog", "rss", ("company", "microsoft"), default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS),
    SourceConfig("nvidia_deep_learning", "company", "rss", "https://blogs.nvidia.com/blog/category/deep-learning/feed/", "blog", "rss", ("company", "nvidia"), default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS),
    SourceConfig("apple_ml", "company", "rss", "https://machinelearning.apple.com/rss.xml", "blog", "rss", ("company", "apple"), default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS),
    SourceConfig("amazon_science", "company", "rss", "https://www.amazon.science/index.rss", "blog", "rss", ("company", "amazon"), default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS),
    SourceConfig("hf_blog", "company", "rss", "https://huggingface.co/blog/feed.xml", "blog", "rss", ("company", "huggingface"), {"fetch_detail": True}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS),
    SourceConfig("kakao_tech_rss", "company_kr", "rss", "https://tech.kakao.com/feed/", "blog", "rss", ("company", "kr", "kakao"), default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS),
    SourceConfig("naver_cloud_blog_rss", "company_kr", "rss", "https://rss.blog.naver.com/n_cloudplatform.xml", "blog", "rss", ("company", "kr", "naver"), default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS),
    SourceConfig("qwen_blog_rss", "company_cn", "rss", "https://qwenlm.github.io/blog/index.xml", "blog", "rss", ("company", "cn", "qwen"), default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS),
    SourceConfig("salesforce_ai_research_rss", "company", "rss", "https://www.salesforce.com/blog/category/ai-research/feed/", "blog", "rss", ("company", "salesforce"), default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS),
    SourceConfig("google_research_blog", "company", "rss", "https://research.google/blog/rss/", "blog", "rss", ("company", "google", "research"), default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS),
    SourceConfig("geeknews_rss", "community", "rss", "https://news.hada.io/rss/news", "news", "rss", ("community", "kr", "geeknews"), default_limit=LOW_SIGNAL_COMMUNITY_LIMIT),
    SourceConfig("lobsters_ai_rss", "community", "rss", "https://lobste.rs/t/ai.rss", "post", "rss", ("community", "lobsters", "ai"), default_limit=LOW_SIGNAL_COMMUNITY_LIMIT),
]


SOURCE_REGISTRY: dict[str, SourceConfig] = {config.name: config for config in RSS_SOURCES}


def register(config: SourceConfig) -> None:
    SOURCE_REGISTRY[config.name] = config


register(SourceConfig("hf_daily_papers", "papers", "api", "https://huggingface.co/api/daily_papers", "paper", "hf_daily_papers", ("paper", "huggingface"), default_limit=PAPER_DAILY_LIMIT))
register(SourceConfig("hf_models_new", "models", "api", "https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=20", "model", "hf_models_listing", ("model", "huggingface", "new"), {"sort": "createdAt", "direction": "-1"}, default_limit=DEFAULT_SOURCE_LIMIT))
register(SourceConfig("hf_trending_models", "models", "api", "https://huggingface.co/api/trending?type=model", "model_trending", "hf_trending", ("model", "huggingface", "trending"), default_limit=DEFAULT_SOURCE_LIMIT))
register(SourceConfig("hn_topstories", "community", "api", "https://hacker-news.firebaseio.com/v0/topstories.json", "post", "hn_topstories", ("community", "hn"), default_limit=LOW_SIGNAL_COMMUNITY_LIMIT))
register(SourceConfig("reddit_machinelearning", "community", "json", "https://www.reddit.com/r/MachineLearning/.json?limit=20", "post", "reddit_listing", ("community", "reddit", "machinelearning"), default_limit=DEFAULT_SOURCE_LIMIT))
register(SourceConfig("reddit_localllama", "community", "json", "https://www.reddit.com/r/LocalLLaMA/.json?limit=20", "post", "reddit_listing", ("community", "reddit", "localllama"), default_limit=DEFAULT_SOURCE_LIMIT))
register(SourceConfig("open_llm_leaderboard", "benchmark", "api", "https://datasets-server.huggingface.co/rows?dataset=open-llm-leaderboard/contents&config=default&split=train&offset=0&length=20", "benchmark", "open_llm_leaderboard", ("benchmark", "leaderboard")))
register(SourceConfig("samsung_research_posts", "company_kr", "api", "https://research.samsung.com/blogMain/list.json", "blog", "samsung_research_posts", ("company", "kr", "samsung"), default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("lg_ai_research_blog", "company_kr", "api", "https://www.lgresearch.ai/api/board/blog/list", "blog", "lg_ai_research_api", ("company", "kr", "lgai"), {"kind": "blog"}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("github_curated_repos", "community", "api", "https://api.github.com/repos", "repo", "github_watchlist_repos", ("community", "github"), {"repos": ["huggingface/transformers", "vllm-project/vllm", "openai/openai-python", "ggerganov/llama.cpp", "ollama/ollama", "langchain-ai/langchain", "sgl-project/sglang", "BerriAI/litellm", "microsoft/autogen", "run-llama/llama_index"]}, default_limit=GITHUB_WATCHLIST_LIMIT))
register(SourceConfig("github_tencent_hunyuan_repos", "company_cn", "api", "https://api.github.com/orgs/Tencent-Hunyuan/repos?sort=updated&per_page=20", "repo", "github_org_repos", ("company", "cn", "tencent"), {"org": "Tencent-Hunyuan"}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("github_paddlepaddle_repos", "company_cn", "api", "https://api.github.com/orgs/PaddlePaddle/repos?sort=updated&per_page=20", "repo", "github_org_repos", ("company", "cn", "paddlepaddle"), {"org": "PaddlePaddle"}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("github_bytedance_repos", "company_cn", "api", "https://api.github.com/orgs/bytedance/repos?sort=updated&per_page=20", "repo", "github_org_repos", ("company", "cn", "bytedance"), {"org": "bytedance"}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("github_mindspore_repos", "company_cn", "api", "https://api.github.com/orgs/mindspore-ai/repos?sort=updated&per_page=20", "repo", "github_org_repos", ("company", "cn", "mindspore"), {"org": "mindspore-ai"}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("anthropic_news", "company", "scrape", "https://www.anthropic.com/news", "news", "html_listing_with_detail", ("company", "anthropic"), {"include_prefixes": ["/news/", "/81k-interviews"], "exclude_exact": ["/news"], "note": "Headline, category/date teaser on list; detail fetch adds full body and meta."}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("deepmind_blog", "company", "scrape", "https://deepmind.google/blog/", "blog", "html_listing_with_detail", ("company", "deepmind"), {"include_contains": ["/blog/"], "exclude_exact": ["/blog/", "/blog"], "detail_body_selectors": ["main .rich-text"], "note": "List page gives links; detail pages carry stronger meta and body text."}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("mistral_news", "company", "scrape", "https://mistral.ai/news/", "news", "html_listing_with_detail", ("company", "mistral"), {"include_prefixes": ["/news/"], "exclude_exact": ["/news/", "/news"], "note": "List page exposes product/update cards; detail fetch adds fuller descriptions."}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("stability_news", "company", "scrape", "https://stability.ai/news-updates", "news", "html_listing_with_detail", ("company", "stability"), {"include_prefixes": ["/news-updates/"], "exclude_exact": ["/news-updates"], "note": "Squarespace news listing; detail pages provide cleaner title/body than list cards."}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("groq_newsroom", "company", "scrape", "https://groq.com/newsroom", "news", "html_listing_with_detail", ("company", "groq"), {"include_prefixes": ["/newsroom/"], "exclude_exact": ["/newsroom"], "note": "Newsroom cards are visible on the list page; detail pages add full body text."}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("upstage_blog", "company_kr", "scrape", "https://www.upstage.ai/blog", "blog", "html_listing_with_detail", ("company", "kr", "upstage"), {"include_contains": ["/blog/"], "exclude_exact": ["/blog"], "note": "List page is rich enough for title/category/date hints; detail fetch adds body and meta."}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("deepseek_updates", "company_cn", "scrape", "https://api-docs.deepseek.com/updates/", "release_note", "html_listing_with_detail", ("company", "cn", "deepseek"), {"include_prefixes": ["/news/"], "exclude_exact": ["/updates/", "/updates"], "note": "Docs changelog page exposes release links and date hints; detail pages add changelog body."}, default_limit=DEFAULT_SOURCE_LIMIT, max_age_days=COMPANY_MAX_AGE_DAYS))
register(SourceConfig("lmarena_overview", "benchmark", "scrape", "https://arena.ai/leaderboard", "benchmark_panel", "lmarena_overview", ("benchmark", "lmarena")))


def resolve_sources(names: list[str] | None) -> list[SourceConfig]:
    if not names or names == ["all"]:
        return [SOURCE_REGISTRY[name] for name in sorted(SOURCE_REGISTRY)]
    resolved: list[SourceConfig] = []
    for name in names:
        key = name.strip()
        if key not in SOURCE_REGISTRY:
            raise KeyError(f"Unknown source: {key}")
        resolved.append(SOURCE_REGISTRY[key])
    return resolved


def fetch_source(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetcher_key = config.parser
    fetcher = FETCHER_REGISTRY.get(fetcher_key)
    if fetcher is None:
        raise KeyError(f"No fetcher registered for parser={fetcher_key}")
    return fetcher(client, config, run_id, limit)


def fetch_rss_source(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    response = timed_request(result, client, "GET", config.endpoint, request_name="feed")
    response.raise_for_status()
    parsed = feedparser.parse(response.text)
    result.raw_responses.append(RawResponse(filename="fetch_001.xml", body=response.content))

    for idx, entry in enumerate(parsed.entries[:limit]):
        url = entry_link(entry)
        source_item_id = stable_id(entry.get("id"), entry.get("guid"), url, entry.get("title"))
        raw_item = wrap_raw_item(
            source=config.name,
            source_item_id=source_item_id,
            fetch_id="fetch_001",
            fetched_at=fetched_at,
            payload=entry,
        )
        result.raw_items.append(raw_item)
        tags = list(config.default_tags)
        for tag in entry.get("tags", []) or []:
            term = tag.get("term")
            if term and term not in tags:
                tags.append(term)
        description = entry.get("summary") or entry.get("description")
        content_html = " ".join(part.get("value", "") for part in (entry.get("content") or []) if isinstance(part, dict))
        body_text = clean_html(content_html or description or "")
        authors = entry_authors(entry)
        author = authors[0] if authors else entry.get("author")
        media_urls = entry_media_urls(entry)
        published_at = parse_date(entry.get("published_parsed") or entry.get("updated_parsed") or entry.get("published") or entry.get("updated"))
        updated_at = parse_date(entry.get("updated_parsed") or entry.get("updated"))
        external_ids = {"feed_entry_id": entry.get("id") or entry.get("guid")}
        arxiv_id = extract_arxiv_id(entry.get("id"), url)
        if arxiv_id:
            external_ids["arxiv_id"] = arxiv_id
        if config.extra.get("fetch_detail") and url:
            detail_response = timed_request(
                result,
                client,
                "GET",
                url,
                request_name=f"detail_{idx + 1:03d}",
            )
            detail_response.raise_for_status()
            detail_fetch_id = f"fetch_detail_{idx + 1:03d}"
            result.raw_responses.append(RawResponse(filename=f"{detail_fetch_id}.html", body=detail_response.content))
            detail_fields = extract_detail_fields(BeautifulSoup(detail_response.text, "html.parser"), entry.get("title"), published_at)
            description = detail_fields.get("description") or description
            body_text = detail_fields.get("body_text") or body_text
            published_at = detail_fields.get("published_at") or published_at
            updated_at = detail_fields.get("updated_at") or updated_at
            if detail_fields.get("author"):
                author = detail_fields["author"]
            if author and author not in authors:
                authors = [author, *authors]
            if detail_fields.get("hero_image_url") and detail_fields["hero_image_url"] not in media_urls:
                media_urls.append(detail_fields["hero_image_url"])
            if detail_fields.get("canonical_url"):
                url = detail_fields["canonical_url"]
        if config.name.startswith("arxiv_rss_"):
            description = strip_arxiv_rss_abstract_boilerplate(description)
            body_text = strip_arxiv_rss_abstract_boilerplate(body_text) or description
        result.documents.append(
            make_document(
                run_id=run_id,
                source=config.name,
                source_category=config.category,
                source_method=config.method,
                source_endpoint=config.endpoint,
                source_item_id=source_item_id,
                doc_type=config.doc_type,
                title=entry.get("title", "").strip(),
                description=description,
                url=url,
                canonical_url=url,
                reference_url=url,
                author=author,
                authors=authors,
                published_at=published_at,
                updated_at=updated_at,
                time_semantics="published",
                body_text=body_text,
                tags=tags,
                engagement={},
                metadata={
                    "method": config.method,
                    "feed_title": parsed.feed.get("title"),
                    "feed_link": parsed.feed.get("link"),
                    "entry_id": entry.get("id"),
                    "guid": entry.get("guid"),
                    "entry_updated": updated_at,
                    "comment_count": entry.get("thr_total"),
                    "media_urls": media_urls,
                },
                external_ids=external_ids,
                related_urls=media_urls[:3],
                raw_ref={"fetch_id": "fetch_001", "line_index": idx},
                fetched_at=fetched_at,
            )
        )

    return result


def fetch_hf_daily_papers(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    response = timed_request(result, client, "GET", config.endpoint, request_name="feed")
    response.raise_for_status()
    items = response.json()[:limit]
    result.raw_responses.append(RawResponse(filename="fetch_001.json", body=response.content))

    for idx, item in enumerate(items):
        paper = item.get("paper", {})
        source_item_id = stable_id(paper.get("id"), item.get("title"))
        result.raw_items.append(
            wrap_raw_item(
                source=config.name,
                source_item_id=source_item_id,
                fetch_id="fetch_001",
                fetched_at=fetched_at,
                payload=item,
            )
        )
        authors = [author.get("name") for author in paper.get("authors", []) if author.get("name")]
        title = item.get("title") or paper.get("title") or source_item_id
        url = f"https://arxiv.org/abs/{paper.get('id')}" if paper.get("id") else None
        ai_summary = paper.get("ai_summary")
        paper_summary = paper.get("summary")
        github_repo = paper.get("githubRepo")
        ai_keywords = [keyword for keyword in (paper.get("ai_keywords") or []) if isinstance(keyword, str)]
        tags = ["paper", "huggingface", "daily_papers"] + ai_keywords[:5]
        result.documents.append(
            make_document(
                run_id=run_id,
                source=config.name,
                source_category=config.category,
                source_method=config.method,
                source_endpoint=config.endpoint,
                source_item_id=source_item_id,
                doc_type=config.doc_type,
                title=title,
                description=item.get("summary"),
                url=url,
                canonical_url=url,
                reference_url=url,
                author=", ".join(authors) if authors else None,
                authors=authors,
                published_at=parse_date(item.get("publishedAt") or paper.get("publishedAt")),
                time_semantics="published",
                body_text=clean_html(item.get("summary") or ai_summary or paper_summary),
                summary_input_text=build_summary_input(title, item.get("summary") or ai_summary, paper_summary),
                tags=tags,
                engagement={
                    "comments": item.get("numComments"),
                    "upvotes": item.get("upvotes"),
                },
                metadata={
                    "paper_id": paper.get("id"),
                    "thumbnail": item.get("thumbnail"),
                    "submitted_by": item.get("submittedBy", {}).get("fullname"),
                    "submitted_by_name": item.get("submittedBy", {}).get("name"),
                    "submitted_by_followers": item.get("submittedBy", {}).get("followerCount"),
                    "discussion_id": paper.get("discussionId"),
                    "github_repo": github_repo,
                    "github_stars": paper.get("githubStars"),
                    "ai_summary": ai_summary,
                    "ai_keywords": ai_keywords,
                    "submitted_on_daily_at": parse_date(paper.get("submittedOnDailyAt")),
                    "is_author_participating": item.get("isAuthorParticipating"),
                },
                external_ids={"arxiv_id": paper.get("id"), "hf_discussion_id": paper.get("discussionId")},
                related_urls=[value for value in (github_repo, item.get("thumbnail")) if value],
                raw_ref={"fetch_id": "fetch_001", "line_index": idx},
                fetched_at=fetched_at,
            )
        )
    return result


def fetch_hf_models_listing(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    sort_key = config.extra.get("sort", "likes")
    direction = config.extra.get("direction", "-1")
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    response = timed_request(
        result,
        client,
        "GET",
        "https://huggingface.co/api/models",
        request_name="feed",
        params={"sort": sort_key, "direction": direction, "limit": limit},
    )
    response.raise_for_status()
    items = response.json()
    result.raw_responses.append(RawResponse(filename="fetch_001.json", body=response.content))

    for idx, item in enumerate(items):
        source_item_id = stable_id(item.get("id"))
        created_at = parse_date(item.get("createdAt"))
        updated_at = parse_date(item.get("lastModified"))
        model_tags = [tag for tag in item.get("tags", []) if isinstance(tag, str)]
        arxiv_ids = prefixed_tag_values(model_tags, "arxiv:")
        license_tags = prefixed_tag_values(model_tags, "license:")
        regions = prefixed_tag_values(model_tags, "region:")
        description = " ".join(
            part
            for part in [
                item.get("pipeline_tag"),
                item.get("library_name"),
                " / ".join(license_tags[:2]) if license_tags else None,
            ]
            if part
        ) or None
        result.raw_items.append(
            wrap_raw_item(
                source=config.name,
                source_item_id=source_item_id,
                fetch_id="fetch_001",
                fetched_at=fetched_at,
                payload=item,
            )
        )
        result.documents.append(
            make_document(
                run_id=run_id,
                source=config.name,
                source_category=config.category,
                source_method=config.method,
                source_endpoint=config.endpoint,
                source_item_id=source_item_id,
                doc_type=config.doc_type,
                title=item.get("id", source_item_id),
                url=f"https://huggingface.co/{item.get('id')}" if item.get("id") else None,
                canonical_url=f"https://huggingface.co/{item.get('id')}" if item.get("id") else None,
                reference_url=f"https://huggingface.co/{item.get('id')}" if item.get("id") else None,
                author=item.get("author"),
                description=description,
                published_at=created_at,
                updated_at=updated_at,
                sort_at=created_at or updated_at,
                time_semantics="created" if created_at else "updated",
                body_text=" ".join(model_tags[:20]),
                tags=list(config.default_tags) + model_tags[:10],
                engagement={
                    "likes": item.get("likes"),
                    "downloads": item.get("downloads"),
                },
                metadata={
                    "pipeline_tag": item.get("pipeline_tag"),
                    "library_name": item.get("library_name"),
                    "private": item.get("private"),
                    "license_tags": license_tags,
                    "regions": regions,
                    "arxiv_ids": arxiv_ids,
                    "eval_results": "eval-results" in model_tags,
                    "sort_key": sort_key,
                    "sort_direction": direction,
                },
                external_ids={"hf_model_id": item.get("id"), "hf_model_api_id": item.get("modelId")},
                raw_ref={"fetch_id": "fetch_001", "line_index": idx},
                fetched_at=fetched_at,
            )
        )
        for metric_name in ("likes", "downloads"):
            metric_value = item.get(metric_name)
            if metric_value is not None:
                result.metrics.append(
                    make_metric(
                        run_id=run_id,
                        source=config.name,
                        source_item_id=source_item_id,
                        metric_name=metric_name,
                        metric_value=metric_value,
                        observed_at=fetched_at,
                        metadata={"url": f"https://huggingface.co/{item.get('id')}"},
                    )
                )
    return result


def fetch_hf_trending(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    response = timed_request(result, client, "GET", config.endpoint, request_name="feed", params={"type": "model"})
    response.raise_for_status()
    payload = response.json()
    items = payload.get("recentlyTrending", [])[:limit]
    result.raw_responses.append(RawResponse(filename="fetch_001.json", body=response.content))

    for idx, item in enumerate(items):
        repo_data = item.get("repoData", {})
        source_item_id = stable_id(repo_data.get("id"))
        author_data = repo_data.get("authorData") or {}
        inference_providers = repo_data.get("availableInferenceProviders") or []
        widget_urls = [url for url in (repo_data.get("widgetOutputUrls") or []) if isinstance(url, str)]
        num_parameters = repo_data.get("numParameters")
        description = " ".join(
            part
            for part in [
                repo_data.get("pipeline_tag"),
                f"params={num_parameters}" if num_parameters else None,
                "gated" if repo_data.get("gated") else None,
            ]
            if part
        ) or None
        result.raw_items.append(
            wrap_raw_item(
                source=config.name,
                source_item_id=source_item_id,
                fetch_id="fetch_001",
                fetched_at=fetched_at,
                payload=item,
            )
        )
        result.documents.append(
            make_document(
                run_id=run_id,
                source=config.name,
                source_category=config.category,
                source_method=config.method,
                source_endpoint=config.endpoint,
                source_item_id=source_item_id,
                doc_type=config.doc_type,
                title=repo_data.get("id", source_item_id),
                url=f"https://huggingface.co/{repo_data.get('id')}" if repo_data.get("id") else None,
                canonical_url=f"https://huggingface.co/{repo_data.get('id')}" if repo_data.get("id") else None,
                reference_url=f"https://huggingface.co/{repo_data.get('id')}" if repo_data.get("id") else None,
                author=author_data.get("fullname") or repo_data.get("author"),
                description=description,
                published_at=parse_date(repo_data.get("createdAt")),
                updated_at=parse_date(repo_data.get("lastModified")),
                sort_at=parse_date(repo_data.get("createdAt")) or parse_date(repo_data.get("lastModified")),
                time_semantics="updated",
                body_text=description or repo_data.get("pipeline_tag"),
                tags=["model", "huggingface", "trending"],
                engagement={
                    "likes": repo_data.get("likes"),
                    "downloads": repo_data.get("downloads"),
                },
                metadata={
                    "repo_type": item.get("repoType"),
                    "pipeline_tag": repo_data.get("pipeline_tag"),
                    "gated": repo_data.get("gated"),
                    "author_display_name": author_data.get("fullname"),
                    "author_follower_count": author_data.get("followerCount"),
                    "available_inference_providers": inference_providers,
                    "available_inference_providers_count": len(inference_providers),
                    "widget_output_urls": widget_urls,
                    "num_parameters": num_parameters,
                    "trending_position": idx + 1,
                },
                external_ids={"hf_model_id": repo_data.get("id")},
                related_urls=widget_urls[:5],
                raw_ref={"fetch_id": "fetch_001", "line_index": idx},
                fetched_at=fetched_at,
            )
        )
    return result


def fetch_hn_topstories(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    ids_response = timed_request(result, client, "GET", config.endpoint, request_name="topstories_ids")
    ids_response.raise_for_status()
    story_ids = ids_response.json()[:limit]
    items: list[dict[str, Any]] = []
    for story_id in story_ids:
        item_response = timed_request(
            result,
            client,
            "GET",
            f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json",
            request_name=f"item_{story_id}",
        )
        item_response.raise_for_status()
        items.append(item_response.json())
    result.raw_responses.append(RawResponse(filename="fetch_001_ids.json", body=ids_response.content))
    result.raw_responses.append(RawResponse(filename="fetch_002_items.json", body=json.dumps(items, ensure_ascii=False, indent=2).encode("utf-8")))

    for idx, item in enumerate(items):
        source_item_id = stable_id(item.get("id"))
        discussion_url = f"https://news.ycombinator.com/item?id={source_item_id}"
        outbound_url = item.get("url")
        result.raw_items.append(
            wrap_raw_item(
                source=config.name,
                source_item_id=source_item_id,
                fetch_id="fetch_002",
                fetched_at=fetched_at,
                payload=item,
            )
        )
        result.documents.append(
            make_document(
                run_id=run_id,
                source=config.name,
                source_category=config.category,
                source_method=config.method,
                source_endpoint=config.endpoint,
                source_item_id=source_item_id,
                doc_type=item.get("type", config.doc_type),
                title=item.get("title") or f"HN item {source_item_id}",
                url=outbound_url or discussion_url,
                canonical_url=outbound_url or discussion_url,
                reference_url=discussion_url,
                author=item.get("by"),
                published_at=parse_date(item.get("time")),
                time_semantics="published",
                body_text=clean_html(item.get("text")),
                tags=["community", "hn", item.get("type", "story")],
                engagement={
                    "score": item.get("score"),
                    "comments": item.get("descendants"),
                },
                metadata={
                    "kids": item.get("kids", [])[:20],
                    "kids_count": len(item.get("kids") or []),
                    "domain": extract_domain(outbound_url),
                    "hn_discussion_url": discussion_url,
                },
                external_ids={"hn_id": item.get("id")},
                related_urls=[discussion_url],
                raw_ref={"fetch_id": "fetch_002", "line_index": idx},
                fetched_at=fetched_at,
            )
        )
    return result


def fetch_samsung_research_posts(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    response = timed_request(
        result,
        client,
        "POST",
        config.endpoint,
        request_name="feed",
        json={"startIndex": 1, "currentPageNo": 1, "endIndex": max(limit, 9)},
        headers={"Content-Type": "application/json", **DEFAULT_HEADERS},
    )
    response.raise_for_status()
    payload = response.json()
    items = (payload.get("value") or [])[:limit]
    result.raw_responses.append(RawResponse(filename="fetch_001.json", body=response.content))

    for idx, item in enumerate(items):
        source_item_id = stable_id(item.get("urlLink"), item.get("title"))
        url_link = item.get("urlLink")
        absolute_url = f"https://research.samsung.com{url_link}" if isinstance(url_link, str) and url_link.startswith("/") else url_link
        body_parts = [item.get("detail"), item.get("hashTag1"), item.get("hashTag2")]
        hashtags = [normalize_space(value) for value in (item.get("hashTag1"), item.get("hashTag2")) if normalize_space(value)]
        related_urls = [
            value
            for value in (
                item.get("thumbnailUrl"),
                item.get("preUrl"),
                item.get("nextUrl"),
            )
            if value
        ]
        result.raw_items.append(
            wrap_raw_item(
                source=config.name,
                source_item_id=source_item_id,
                fetch_id="fetch_001",
                fetched_at=fetched_at,
                payload=item,
            )
        )
        result.documents.append(
            make_document(
                run_id=run_id,
                source=config.name,
                source_category=config.category,
                source_method=config.method,
                source_endpoint=config.endpoint,
                source_item_id=source_item_id,
                doc_type=config.doc_type,
                title=item.get("title") or source_item_id,
                description=item.get("detail"),
                url=absolute_url,
                canonical_url=absolute_url,
                reference_url=absolute_url,
                author=item.get("authorName"),
                authors=[name for name in (item.get("authorList") or []) if isinstance(name, str)],
                published_at=parse_date(item.get("publicationDtsStr")),
                time_semantics="published",
                body_text=clean_html(" ".join(part for part in body_parts if part)),
                tags=["company", "kr", "samsung", item.get("catagoryCode", "")],
                engagement={},
                metadata={
                    "thumbnail_url": item.get("thumbnailUrl"),
                    "author_list": item.get("authorList"),
                    "author_thumbnail_url": item.get("authorThumbnailUrl"),
                    "hashtags": hashtags,
                    "alt_text": item.get("altText"),
                    "publication_url": item.get("pubUrl"),
                    "prev_title": item.get("preTitle"),
                    "next_title": item.get("nextTitle"),
                },
                external_ids={"samsung_blog_idx": item.get("blogIdx"), "samsung_idx": item.get("idx")},
                related_urls=related_urls,
                raw_ref={"fetch_id": "fetch_001", "line_index": idx},
                fetched_at=fetched_at,
            )
        )
    return result


def fetch_lg_ai_research_api(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    response = timed_request(result, client, "GET", config.endpoint, request_name="feed")
    response.raise_for_status()
    payload = response.json()
    items = ((payload.get("data") or {}).get("list") or [])[:limit]
    result.raw_responses.append(RawResponse(filename="fetch_001.json", body=response.content))
    lg_base_url = "https://www.lgresearch.ai"
    kind = normalize_space(str(config.extra.get("kind") or "blog")).lower()
    filled_detail_url_count = 0

    for idx, item in enumerate(items):
        source_item_id = stable_id(item.get("seq"), item.get("ttl"))
        body_text = clean_html(item.get("cont") or item.get("description") or item.get("hdlnCont"))
        tags = ["company", "kr", "lgai", kind]
        if item.get("catgCd"):
            tags.append(str(item.get("catgCd")))
        blog_writers = extract_name_list(item.get("blogWriters"))
        related_urls = [
            value
            for value in (
                resolve_absolute_url(lg_base_url, item.get("thmnlImg")),
                resolve_absolute_url(lg_base_url, item.get("img")),
                resolve_absolute_url(lg_base_url, item.get("vodUrl")),
            )
            if value
        ]
        resolved_url = resolve_absolute_url(lg_base_url, item.get("linkUrl"))
        if not resolved_url and kind == "blog" and item.get("seq"):
            resolved_url = f"{lg_base_url}/blog/view?seq={item.get('seq')}"
            filled_detail_url_count += 1
        result.raw_items.append(
            wrap_raw_item(
                source=config.name,
                source_item_id=source_item_id,
                fetch_id="fetch_001",
                fetched_at=fetched_at,
                payload=item,
            )
        )
        result.documents.append(
            make_document(
                run_id=run_id,
                source=config.name,
                source_category=config.category,
                source_method=config.method,
                source_endpoint=config.endpoint,
                source_item_id=source_item_id,
                doc_type=config.doc_type,
                title=item.get("ttl") or source_item_id,
                description=item.get("description") or item.get("hdlnCont"),
                url=resolved_url,
                canonical_url=resolved_url,
                reference_url=resolved_url,
                author=blog_writers[0] if blog_writers else None,
                authors=blog_writers,
                published_at=parse_date(item.get("rgstYmd")),
                updated_at=parse_date(item.get("modYmd")),
                time_semantics="published",
                body_text=body_text,
                tags=tags,
                engagement={"read_count": item.get("readCnt")},
                metadata={
                    "lg_kind": kind,
                    "link_url_raw": item.get("linkUrl"),
                    "thumbnail": item.get("thmnlImg"),
                    "lang_tp": item.get("langTp"),
                    "news_tags": item.get("newsTags"),
                    "blog_tags": item.get("blogTags"),
                    "headline": item.get("hdlnYn"),
                    "writers": blog_writers,
                    "image_alt": item.get("imgAlt"),
                    "thumbnail_alt": item.get("thmnlImgAlt"),
                },
                language=item.get("langTp"),
                external_ids={"lg_seq": item.get("seq")},
                related_urls=related_urls,
                raw_ref={"fetch_id": "fetch_001", "line_index": idx},
                fetched_at=fetched_at,
            )
        )
    if filled_detail_url_count:
        result.notes.append(f"Filled {filled_detail_url_count} LG AI Research blog detail URL(s) from the public seq-based route.")
    return result


def fetch_reddit_listing(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    response = timed_request(
        result,
        client,
        "GET",
        config.endpoint,
        request_name="feed",
        headers={
            "User-Agent": "SparkOrbitSourceTester/0.1 by /u/sparkorbit-dev",
            "Accept": "application/json",
        },
    )
    response.raise_for_status()
    payload = response.json()
    children = payload.get("data", {}).get("children", [])[:limit]
    result.raw_responses.append(RawResponse(filename="fetch_001.json", body=response.content))

    for idx, child in enumerate(children):
        data = child.get("data", {})
        source_item_id = stable_id(data.get("id"))
        permalink = f"https://www.reddit.com{data.get('permalink')}" if data.get("permalink") else None
        outbound_url = data.get("url") or permalink
        thumbnail = data.get("thumbnail")
        related_urls = [value for value in (permalink, thumbnail if isinstance(thumbnail, str) and thumbnail.startswith("http") else None) if value]
        result.raw_items.append(
            wrap_raw_item(
                source=config.name,
                source_item_id=source_item_id,
                fetch_id="fetch_001",
                fetched_at=fetched_at,
                payload=data,
            )
        )
        result.documents.append(
            make_document(
                run_id=run_id,
                source=config.name,
                source_category=config.category,
                source_method=config.method,
                source_endpoint=config.endpoint,
                source_item_id=source_item_id,
                doc_type=config.doc_type,
                title=data.get("title") or source_item_id,
                url=outbound_url,
                canonical_url=outbound_url if not data.get("is_self") else permalink,
                reference_url=permalink or outbound_url,
                author=data.get("author"),
                description=data.get("selftext"),
                published_at=parse_date(data.get("created_utc")),
                time_semantics="published",
                body_text=clean_html(data.get("selftext")),
                tags=[
                    "community",
                    "reddit",
                    data.get("subreddit", "").lower(),
                ] + ([data.get("link_flair_text")] if data.get("link_flair_text") else []),
                engagement={
                    "score": data.get("score"),
                    "comments": data.get("num_comments"),
                    "upvote_ratio": data.get("upvote_ratio"),
                },
                metadata={
                    "permalink": data.get("permalink"),
                    "domain": data.get("domain"),
                    "is_self": data.get("is_self"),
                    "thumbnail_url": thumbnail if isinstance(thumbnail, str) and thumbnail.startswith("http") else None,
                    "over_18": data.get("over_18"),
                    "subreddit_subscribers": data.get("subreddit_subscribers"),
                    "award_count": data.get("total_awards_received"),
                    "num_crossposts": data.get("num_crossposts"),
                },
                external_ids={
                    "reddit_id": data.get("id"),
                    "subreddit": data.get("subreddit"),
                    "subreddit_id": data.get("subreddit_id"),
                },
                related_urls=related_urls,
                raw_ref={"fetch_id": "fetch_001", "line_index": idx},
                fetched_at=fetched_at,
            )
        )
    return result


def fetch_open_llm_leaderboard(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    response = timed_request(
        result,
        client,
        "GET",
        "https://datasets-server.huggingface.co/rows",
        request_name="feed",
        params={
            "dataset": "open-llm-leaderboard/contents",
            "config": "default",
            "split": "train",
            "offset": 0,
            "length": limit,
        },
    )
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("rows", [])
    result.raw_responses.append(RawResponse(filename="fetch_001.json", body=response.content))

    metric_fields = [
        "Average ⬆️",
        "IFEval",
        "BBH",
        "MATH Lvl 5",
        "GPQA",
        "MUSR",
        "MMLU-PRO",
        "#Params (B)",
        "Hub ❤️",
    ]

    for idx, entry in enumerate(rows):
        row = entry.get("row", {})
        source_item_id = stable_id(row.get("fullname"))
        model_links = extract_links_from_html_fragment(row.get("Model"))
        description = " ".join(
            part
            for part in [
                row.get("Type"),
                row.get("Architecture"),
                row.get("Precision"),
                f"avg={row.get('Average ⬆️')}" if row.get("Average ⬆️") not in (None, "") else None,
            ]
            if part
        ) or None
        result.raw_items.append(
            wrap_raw_item(
                source=config.name,
                source_item_id=source_item_id,
                fetch_id="fetch_001",
                fetched_at=fetched_at,
                payload=row,
            )
        )
        result.documents.append(
            make_document(
                run_id=run_id,
                source=config.name,
                source_category=config.category,
                source_method=config.method,
                source_endpoint=config.endpoint,
                source_item_id=source_item_id,
                doc_type=config.doc_type,
                title=row.get("fullname", source_item_id),
                url=f"https://huggingface.co/{row.get('fullname')}" if row.get("fullname") else None,
                canonical_url=f"https://huggingface.co/{row.get('fullname')}" if row.get("fullname") else None,
                reference_url=model_links[1] if len(model_links) > 1 else (f"https://huggingface.co/{row.get('fullname')}" if row.get("fullname") else None),
                author=None,
                description=description,
                published_at=parse_date(row.get("Submission Date")),
                time_semantics="submission",
                body_text=" ".join(
                    part
                    for part in [
                        row.get("Architecture"),
                        row.get("Precision"),
                        row.get("Hub License"),
                    ]
                    if part
                ),
                tags=["benchmark", "leaderboard", row.get("Precision", ""), row.get("Architecture", "")],
                engagement={},
                metadata={
                    "architecture": row.get("Architecture"),
                    "precision": row.get("Precision"),
                    "license": row.get("Hub License"),
                    "type": row.get("Type"),
                    "weight_type": row.get("Weight type"),
                    "params_b": row.get("#Params (B)"),
                    "available_on_hub": row.get("Available on the hub"),
                    "moe": row.get("MoE"),
                    "flagged": row.get("Flagged"),
                    "chat_template": row.get("Chat Template"),
                    "upload_to_hub_date": parse_date(row.get("Upload To Hub Date")),
                    "generation": row.get("Generation"),
                    "base_model": row.get("Base Model"),
                    "official_providers": row.get("Official Providers"),
                },
                external_ids={"hf_model_id": row.get("fullname"), "model_sha": row.get("Model sha")},
                related_urls=model_links[:3],
                benchmark={
                    "kind": "leaderboard_model_row",
                    "board_id": "open_llm_leaderboard",
                    "board_name": "Open LLM Leaderboard",
                    "snapshot_at": parse_date(row.get("Submission Date")),
                    "score_label": "Average ⬆️",
                    "score_value": row.get("Average ⬆️"),
                    "score_unit": "leaderboard_points",
                    "model_name": row.get("fullname"),
                },
                raw_ref={"fetch_id": "fetch_001", "line_index": idx},
                fetched_at=fetched_at,
            )
        )
        for metric_name in metric_fields:
            metric_value = row.get(metric_name)
            if metric_value not in (None, ""):
                result.metrics.append(
                    make_metric(
                        run_id=run_id,
                        source=config.name,
                        source_item_id=source_item_id,
                        metric_name=metric_name,
                        metric_value=metric_value,
                        observed_at=fetched_at,
                    )
                )
    return result


def github_headers() -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "SparkOrbitSourceTester/0.1",
    }


def is_github_rate_limited(response: httpx.Response) -> bool:
    return response.status_code in {403, 429} and "rate limit" in response.text.lower()


def add_github_repo_document(
    result: FetchResult,
    *,
    config: SourceConfig,
    run_id: str,
    fetched_at: str,
    repo: dict[str, Any],
    fetch_id: str,
    line_index: int = 0,
) -> None:
    source_item_id = stable_id(repo.get("id"))
    topics = [topic for topic in repo.get("topics", []) if isinstance(topic, str)]
    license_name = ((repo.get("license") or {}).get("spdx_id") or (repo.get("license") or {}).get("name"))
    tags = list(config.default_tags) + ["repo"]
    if repo.get("language"):
        tags.append(str(repo.get("language")).lower())
    tags.extend(topics[:10])
    metadata = {
        "full_name": repo.get("full_name"),
        "default_branch": repo.get("default_branch"),
        "language": repo.get("language"),
        "topics": topics,
        "license": license_name,
        "created_at": parse_date(repo.get("created_at")),
        "updated_at": parse_date(repo.get("updated_at")),
        "pushed_at": parse_date(repo.get("pushed_at")),
        "archived": repo.get("archived"),
        "fork": repo.get("fork"),
        "subscribers_count": repo.get("subscribers_count"),
        "has_discussions": repo.get("has_discussions"),
        "network_count": repo.get("network_count"),
    }
    result.raw_items.append(
        wrap_raw_item(
            source=config.name,
            source_item_id=source_item_id,
            fetch_id=fetch_id,
            fetched_at=fetched_at,
            payload=repo,
        )
    )
    result.documents.append(
        make_document(
            run_id=run_id,
            source=config.name,
            source_category=config.category,
            source_method=config.method,
            source_endpoint=config.endpoint,
            source_item_id=source_item_id,
            doc_type=config.doc_type,
            title=repo.get("full_name") or source_item_id,
            description=repo.get("description"),
            url=repo.get("html_url"),
            canonical_url=repo.get("html_url"),
            reference_url=repo.get("html_url"),
            author=((repo.get("owner") or {}).get("login")),
            published_at=None,
            updated_at=parse_date(repo.get("updated_at")),
            sort_at=parse_date(repo.get("pushed_at")) or parse_date(repo.get("updated_at")),
            time_semantics="updated",
            body_text=repo.get("description"),
            tags=tags,
            engagement={
                "stars": repo.get("stargazers_count"),
                "forks": repo.get("forks_count"),
                "watchers": repo.get("watchers_count"),
                "open_issues": repo.get("open_issues_count"),
            },
            metadata=metadata,
            external_ids={"github_repo_id": repo.get("id"), "github_full_name": repo.get("full_name")},
            related_urls=[repo.get("homepage")] if repo.get("homepage") else [],
            raw_ref={"fetch_id": fetch_id, "line_index": line_index},
            fetched_at=fetched_at,
        )
    )
    for metric_name, metric_value in (
        ("stars", repo.get("stargazers_count")),
        ("forks", repo.get("forks_count")),
        ("watchers", repo.get("watchers_count")),
        ("open_issues", repo.get("open_issues_count")),
    ):
        if metric_value is not None:
            result.metrics.append(
                make_metric(
                    run_id=run_id,
                    source=config.name,
                    source_item_id=source_item_id,
                    metric_name=metric_name,
                    metric_value=metric_value,
                    observed_at=fetched_at,
                    metadata={"url": repo.get("html_url")},
                )
            )


def add_github_release_document(
    client: httpx.Client,
    result: FetchResult,
    *,
    config: SourceConfig,
    run_id: str,
    fetched_at: str,
    repo: dict[str, Any],
    fetch_index: int,
) -> bool:
    releases_url = f"https://api.github.com/repos/{repo.get('full_name')}/releases/latest"
    response = timed_request(
        result,
        client,
        "GET",
        releases_url,
        request_name=f"release_{fetch_index:03d}",
        headers=github_headers(),
    )
    if response.status_code == 404:
        return True
    if response.status_code in {403, 429} and "rate limit" in response.text.lower():
        result.notes.append("GitHub release fetch skipped after hitting unauthenticated rate limits.")
        return False
    response.raise_for_status()
    release = response.json()
    raw_filename = f"fetch_release_{fetch_index:03d}_{(repo.get('full_name') or 'repo').replace('/', '__')}.json"
    result.raw_responses.append(RawResponse(filename=raw_filename, body=response.content))
    source_item_id = stable_id(release.get("id"), release.get("tag_name"), repo.get("id"))
    result.raw_items.append(
        wrap_raw_item(
            source=config.name,
            source_item_id=source_item_id,
            fetch_id=raw_filename.rsplit(".", 1)[0],
            fetched_at=fetched_at,
            payload=release,
        )
    )
    result.documents.append(
        make_document(
            run_id=run_id,
            source=config.name,
            source_category=config.category,
            source_method=config.method,
            source_endpoint=config.endpoint,
            source_item_id=source_item_id,
            doc_type="release",
            title=release.get("name") or release.get("tag_name") or f"{repo.get('full_name')} release",
            description=release.get("body"),
            url=release.get("html_url"),
            canonical_url=release.get("html_url"),
            reference_url=release.get("html_url"),
            author=((release.get("author") or {}).get("login")),
            published_at=parse_date(release.get("published_at")) or parse_date(release.get("created_at")),
            updated_at=parse_date(release.get("updated_at")),
            time_semantics="published",
            body_text=clean_html(release.get("body")),
            tags=list(config.default_tags) + ["release"],
            engagement={"assets": len(release.get("assets", []))},
            metadata={
                "repo_full_name": repo.get("full_name"),
                "tag_name": release.get("tag_name"),
                "draft": release.get("draft"),
                "prerelease": release.get("prerelease"),
                "created_at": parse_date(release.get("created_at")),
                "target_commitish": release.get("target_commitish"),
                "reactions_total": sum(
                    value for key, value in (release.get("reactions") or {}).items() if key != "url" and isinstance(value, int)
                ),
            },
            external_ids={
                "github_release_id": release.get("id"),
                "github_full_name": repo.get("full_name"),
                "github_tag_name": release.get("tag_name"),
            },
            raw_ref={"fetch_id": raw_filename.rsplit(".", 1)[0], "line_index": fetch_index - 1},
            fetched_at=fetched_at,
        )
    )
    return True


def fetch_github_watchlist_repos(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    repos = config.extra.get("repos", [])[:limit]
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    result.notes.append("Curated GitHub repo watchlist. Repo metadata is primary; latest release is added when the repo publishes GitHub Releases.")

    release_fetch_enabled = True
    for index, full_name in enumerate(repos, start=1):
        response = timed_request(
            result,
            client,
            "GET",
            f"https://api.github.com/repos/{full_name}",
            request_name=f"repo_{index:03d}",
            headers=github_headers(),
        )
        if is_github_rate_limited(response):
            result.notes.append("Skipped remaining GitHub repo fetches after hitting unauthenticated rate limits.")
            break
        response.raise_for_status()
        result.raw_responses.append(RawResponse(filename=f"fetch_repo_{index:03d}_{full_name.replace('/', '__')}.json", body=response.content))
        repo = response.json()
        add_github_repo_document(result, config=config, run_id=run_id, fetched_at=fetched_at, repo=repo, fetch_id=f"fetch_repo_{index:03d}", line_index=index - 1)
        if release_fetch_enabled:
            release_fetch_enabled = add_github_release_document(client, result, config=config, run_id=run_id, fetched_at=fetched_at, repo=repo, fetch_index=index)
    return result


def fetch_github_org_repos(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    response = timed_request(
        result,
        client,
        "GET",
        config.endpoint,
        request_name="repo_feed",
        params={"sort": "updated", "per_page": limit},
        headers=github_headers(),
    )
    if is_github_rate_limited(response):
        result.notes.append(f"Skipped GitHub org repo fetch for {config.extra.get('org')} after hitting unauthenticated rate limits.")
        return result
    response.raise_for_status()
    repos = response.json()[:limit]
    result.raw_responses.append(RawResponse(filename="fetch_001.json", body=response.content))
    result.notes.append(f"GitHub org repo feed for {config.extra.get('org')}. Latest release is fetched opportunistically when available.")

    release_fetch_enabled = True
    for index, repo in enumerate(repos, start=1):
        add_github_repo_document(result, config=config, run_id=run_id, fetched_at=fetched_at, repo=repo, fetch_id="fetch_001", line_index=index - 1)
        if release_fetch_enabled:
            release_fetch_enabled = add_github_release_document(client, result, config=config, run_id=run_id, fetched_at=fetched_at, repo=repo, fetch_index=index)
    return result


def fetch_html_listing_with_detail(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    try:
        response = timed_request(result, client, "GET", config.endpoint, request_name="list")
        response.raise_for_status()
    except Exception as exc:
        if config.name == "deepseek_updates":
            block_probe_url = config.endpoint.replace("https://", "http://", 1)
            try:
                block_response = timed_request(result, client, "GET", block_probe_url, request_name="list_block_probe")
                block_text = normalize_space(block_response.text)
            except Exception:
                block_text = ""
            if "사이트 차단 안내" in block_text or "This website is blocked due to UNIST's information security policy." in block_text:
                raise RuntimeError("DeepSeek is blocked by the current network policy (UNIST blacklist), so this source cannot be collected from this environment.") from exc
        raise
    result.raw_responses.append(RawResponse(filename="fetch_001_list.html", body=response.content))
    if config.extra.get("note"):
        result.notes.append(str(config.extra["note"]))

    candidates = collect_html_candidates(config, response.text)[:limit]
    for index, candidate in enumerate(candidates, start=1):
        detail_response = timed_request(
            result,
            client,
            "GET",
            candidate["url"],
            request_name=f"detail_{index:03d}",
        )
        detail_response.raise_for_status()
        detail_fetch_id = f"fetch_detail_{index:03d}"
        result.raw_responses.append(RawResponse(filename=f"{detail_fetch_id}.html", body=detail_response.content))
        detail_soup = BeautifulSoup(detail_response.text, "html.parser")
        detail_fields = extract_detail_fields(
            detail_soup,
            candidate.get("title_hint"),
            candidate.get("published_at_hint"),
            body_selectors=config.extra.get("detail_body_selectors"),
        )
        if config.name == "deepseek_updates" and not detail_fields.get("published_at"):
            detail_fields["published_at"] = (
                candidate.get("published_at_hint")
                or extract_date_from_text(detail_fields.get("title"))
                or extract_date_from_text(detail_fields.get("body_text"))
                or extract_deepseek_slug_date(candidate.get("url"))
            )
        source_item_id = stable_id(candidate["url"])
        payload = {
            "listing": candidate,
            "detail": {
                "url": candidate["url"],
                "title": detail_fields["title"],
                "author": detail_fields["author"],
                "published_at": detail_fields["published_at"],
                "description": detail_fields["description"],
            },
        }
        result.raw_items.append(
            wrap_raw_item(
                source=config.name,
                source_item_id=source_item_id,
                fetch_id=detail_fetch_id,
                fetched_at=fetched_at,
                payload=payload,
            )
        )
        result.documents.append(
            make_document(
                run_id=run_id,
                source=config.name,
                source_category=config.category,
                source_method=config.method,
                source_endpoint=config.endpoint,
                source_item_id=source_item_id,
                doc_type=config.doc_type,
                title=detail_fields["title"] or candidate["url"],
                description=detail_fields["description"] or candidate.get("context_hint"),
                url=candidate["url"],
                canonical_url=detail_fields.get("canonical_url") or candidate["url"],
                reference_url=candidate["url"],
                author=detail_fields["author"],
                published_at=detail_fields["published_at"],
                updated_at=detail_fields.get("updated_at"),
                time_semantics="published" if detail_fields["published_at"] else ("updated" if detail_fields.get("updated_at") else "unknown"),
                body_text=detail_fields["body_text"] or detail_fields["description"] or candidate.get("context_hint"),
                tags=list(config.default_tags),
                engagement={},
                metadata={
                    "list_title_hint": candidate.get("title_hint"),
                    "list_context_hint": candidate.get("context_hint"),
                    "description": detail_fields["description"],
                    "ld_object_count": detail_fields["ld_object_count"],
                    "hero_image_url": detail_fields.get("hero_image_url"),
                    "canonical_url": detail_fields.get("canonical_url"),
                },
                related_urls=[value for value in (candidate["url"], detail_fields.get("hero_image_url")) if value],
                raw_ref={"fetch_id": detail_fetch_id, "line_index": index - 1},
                fetched_at=fetched_at,
            )
        )
    return result


LM_ARENA_BOARD_LINK_PATTERN = re.compile(r'leaderboardLink\\":\\"(/leaderboard/[^\\"]+)')


def extract_escaped_json_array(raw_text: str, marker: str) -> str | None:
    start = raw_text.find(marker)
    if start == -1:
        return None

    idx = start + len(marker)
    depth = 1
    in_string = False
    escape = False
    while idx < len(raw_text):
        ch = raw_text[idx]
        if escape:
            escape = False
        elif ch == "\\":
            escape = True
        elif ch == '"':
            in_string = not in_string
        elif not in_string:
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    return raw_text[start + len(marker) - 1 : idx + 1]
        idx += 1
    return None


def decode_escaped_json_value(raw_value: str) -> Any:
    return json.loads(raw_value.encode("utf-8").decode("unicode_escape"))


def parse_lmarena_board_page(html: str) -> dict[str, Any]:
    entries_raw = extract_escaped_json_array(html, '\\"entries\\":[')
    if not entries_raw:
        raise ValueError("Could not locate LMArena entries array.")

    scalar_match = re.search(
        r'\\"voteCutoffISOString\\":\\"([^\\"]+)\\",\\"totalVotes\\":(\d+),\\"totalModels\\":(\d+)',
        html,
    )
    if not scalar_match:
        raise ValueError("Could not locate LMArena board summary fields.")

    vote_cutoff, total_votes, total_models = scalar_match.groups()
    entries_payload = decode_escaped_json_value(entries_raw)
    if not isinstance(entries_payload, list):
        raise ValueError("Decoded LMArena entries payload is not a list.")

    entries: list[dict[str, Any]] = []
    for item in entries_payload:
        if not isinstance(item, dict):
            continue
        rank = item.get("rank")
        rating = item.get("rating")
        votes = item.get("votes")
        if not isinstance(rank, int) or not isinstance(votes, int):
            continue
        if not isinstance(rating, (int, float)):
            continue
        entries.append(
            {
                "rank": rank,
                "model_name": normalize_space(item.get("modelDisplayName")),
                "rating": float(rating),
                "votes": votes,
                "organization": normalize_space(item.get("modelOrganization")) or None,
                "url": normalize_space(item.get("modelUrl")) or None,
                "license": normalize_space(item.get("license")) or None,
                "input_price_per_million": item.get("inputPricePerMillion"),
                "output_price_per_million": item.get("outputPricePerMillion"),
                "context_length": item.get("contextLength"),
            }
        )

    return {
        "vote_cutoff": vote_cutoff,
        "total_votes": int(total_votes),
        "total_models": int(total_models),
        "entries": entries,
    }


def fetch_lmarena_overview(client: httpx.Client, config: SourceConfig, run_id: str, limit: int) -> FetchResult:
    fetched_at = now_utc_iso()
    result = FetchResult(source=config.name, endpoint=config.endpoint)
    response = timed_request(result, client, "GET", config.endpoint, request_name="overview")
    response.raise_for_status()
    text = response.text
    result.raw_responses.append(RawResponse(filename="fetch_001.html", body=response.content))
    result.notes.append("LMArena overview scrape. Overview page discovers board links, and each board page is fetched to capture all available rows.")

    board_links: list[str] = []
    for leaderboard_link in LM_ARENA_BOARD_LINK_PATTERN.findall(text):
        if leaderboard_link not in board_links:
            board_links.append(leaderboard_link)

    for idx, leaderboard_link in enumerate(board_links, start=1):
        board_url = urljoin(config.endpoint, leaderboard_link)
        board_response = timed_request(
            result,
            client,
            "GET",
            board_url,
            request_name=f"board_{idx:02d}",
        )
        board_response.raise_for_status()
        board_fetch_id = f"fetch_board_{idx:02d}"
        result.raw_responses.append(RawResponse(filename=f"{board_fetch_id}.html", body=board_response.content))
        try:
            board_payload = parse_lmarena_board_page(board_response.text)
        except Exception as exc:
            result.notes.append(f"Skipped malformed LMArena board payload for {leaderboard_link}: {exc}")
            continue

        entries = board_payload["entries"]
        top_entries = entries[:limit] if limit > 0 else list(entries)
        vote_cutoff = board_payload["vote_cutoff"]
        total_votes = board_payload["total_votes"]
        total_models = board_payload["total_models"]
        source_item_id = stable_id(leaderboard_link, vote_cutoff)
        title = leaderboard_link.rsplit("/", 1)[-1].replace("-", " ").title()
        if title == "Leaderboard":
            title = "Overview"
        top_model = entries[0] if entries else {}
        result.raw_items.append(
            wrap_raw_item(
                source=config.name,
                source_item_id=source_item_id,
                fetch_id=board_fetch_id,
                fetched_at=fetched_at,
                payload={
                    "leaderboard_link": leaderboard_link,
                    "vote_cutoff": vote_cutoff,
                    "total_votes": total_votes,
                    "total_models": total_models,
                    "captured_entry_count": len(entries),
                    "entries": entries,
                    "top_entries": top_entries,
                },
            )
        )
        result.documents.append(
            make_document(
                run_id=run_id,
                source=config.name,
                source_category=config.category,
                source_method=config.method,
                source_endpoint=config.endpoint,
                source_item_id=source_item_id,
                doc_type=config.doc_type,
                title=f"LMArena {title}",
                description=(
                    f"{title} leaderboard snapshot with {total_models} models and {total_votes} votes. "
                    f"Top model: {top_model.get('model_name')} ({top_model.get('organization')})."
                    if top_model
                    else f"{title} leaderboard snapshot with {total_models} models and {total_votes} votes."
                ),
                url=urljoin(config.endpoint, leaderboard_link),
                canonical_url=urljoin(config.endpoint, leaderboard_link),
                reference_url=urljoin(config.endpoint, leaderboard_link),
                author=None,
                published_at=parse_date(vote_cutoff),
                sort_at=parse_date(vote_cutoff),
                time_semantics="snapshot",
                body_text=(
                    " | ".join(
                        f"#{entry['rank']} {entry['model_name']} ({entry['organization']}) rating={entry['rating']} votes={entry['votes']}"
                        for entry in top_entries
                    )
                    or (
                        f"{title} leaderboard snapshot with {total_models} models and {total_votes} votes."
                    )
                ),
                tags=list(config.default_tags) + [title.lower().replace(" ", "_")],
                engagement={},
                metadata={
                    "leaderboard_link": leaderboard_link,
                    "vote_cutoff": vote_cutoff,
                    "total_votes": total_votes,
                    "total_models": total_models,
                    "captured_entry_count": len(entries),
                    "top_model_name": top_model.get("model_name"),
                    "top_model_org": top_model.get("organization"),
                    "top_model_rating": top_model.get("rating"),
                    "top_model_votes": top_model.get("votes"),
                    "entries": entries,
                    "top_entries": top_entries,
                },
                external_ids={"leaderboard_link": leaderboard_link},
                related_urls=[entry["url"] for entry in entries if entry.get("url")][:20],
                benchmark={
                    "kind": "leaderboard_panel",
                    "board_id": leaderboard_link,
                    "board_name": f"LMArena {title}",
                    "snapshot_at": parse_date(vote_cutoff),
                    "rank": top_model.get("rank"),
                    "score_label": "Arena rating",
                    "score_value": top_model.get("rating"),
                    "score_unit": "elo_like_rating",
                    "votes": top_model.get("votes"),
                    "model_name": top_model.get("model_name"),
                    "organization": top_model.get("organization"),
                    "total_models": total_models,
                    "total_votes": total_votes,
                },
                raw_ref={"fetch_id": board_fetch_id, "line_index": idx - 1},
                fetched_at=fetched_at,
            )
        )
        result.metrics.append(
            make_metric(
                run_id=run_id,
                source=config.name,
                source_item_id=source_item_id,
                metric_name="total_votes",
                metric_value=int(total_votes),
                observed_at=fetched_at,
                metadata={"leaderboard_link": leaderboard_link},
            )
        )
        result.metrics.append(
            make_metric(
                run_id=run_id,
                source=config.name,
                source_item_id=source_item_id,
                metric_name="total_models",
                metric_value=int(total_models),
                observed_at=fetched_at,
                metadata={"leaderboard_link": leaderboard_link},
            )
        )
    return result


FETCHER_REGISTRY = {
    "rss": fetch_rss_source,
    "hf_daily_papers": fetch_hf_daily_papers,
    "hf_models_listing": fetch_hf_models_listing,
    "hf_trending": fetch_hf_trending,
    "hn_topstories": fetch_hn_topstories,
    "reddit_listing": fetch_reddit_listing,
    "open_llm_leaderboard": fetch_open_llm_leaderboard,
    "samsung_research_posts": fetch_samsung_research_posts,
    "lg_ai_research_api": fetch_lg_ai_research_api,
    "github_watchlist_repos": fetch_github_watchlist_repos,
    "github_org_repos": fetch_github_org_repos,
    "html_listing_with_detail": fetch_html_listing_with_detail,
    "lmarena_overview": fetch_lmarena_overview,
}
