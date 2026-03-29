[Index](./README.md) · [🇰🇷 한국어](./05_data_collection_pipeline.ko.md) · [01. Overall Flow](./01_overall_flow.md) · [02. Sections](./02_sections/README.md) · [02.1 Sources](./02_sections/02_1_sources.md) · [02.2 Fields](./02_sections/02_2_fields.md) · [03. Runtime Flow](./03_runtime_flow.md) · [04. LLM Usage](./04_llm_usage.md) · **05. Data Collection Pipeline** · [06. UI Design Guide](./06_ui_design_guide.md)

---

# SparkOrbit Docs - 05. Data Collection Pipeline

> Implemented pipeline
> This document describes the currently implemented `pipelines/source_fetch` collection pipeline.

## Scope

This pipeline fetches directly from sources without Redis and produces the artifacts below.

- `raw_responses/`
- `raw_items/`
- `normalized/documents.ndjson`
- `normalized/metrics.ndjson`
- `normalized/contract_report.json`
- `logs/`

Each run records both per-source total duration and per-request timing. That makes it possible to tell whether a slow source was caused by network latency or parsing overhead just from the run output.

## Public Entrypoint

- `pipelines/source_fetch/scripts/data_collection.py`

This file is the official CLI entrypoint.
It accepts `limit`, `sources`, `output_dir`, and `timeout`, then calls `run_collection(...)`.
By default it uses per-source limits. Most sources fetch `20` items, paper sources fetch `16` items per source, and low-density sources such as `hn_topstories` fetch fewer. Passing `--limit` applies the same override to every source.

## Code Layout

| File | Role |
|------|------|
| `pipelines/source_fetch/scripts/data_collection.py` | Single CLI entrypoint |
| `pipelines/source_fetch/scripts/source_fetch/adapters.py` | Source registry plus per-source fetch and parse |
| `pipelines/source_fetch/scripts/source_fetch/models.py` | `SourceConfig`, `FetchResult`, `RawResponse` dataclasses |
| `pipelines/source_fetch/scripts/source_fetch/pipeline.py` | Orchestration, normalization, filtering, ranking, reporting |

## Implemented Flow

```text
data_collection.py
  -> resolve selected sources
  -> fetch_source(...) for each source
  -> write raw_responses + raw_items
  -> normalize document / metric contract
  -> compute discovery + ranking during document normalization
  -> filter out URL-less documents
  -> write documents.ndjson + metrics.ndjson
  -> write manifests + contract report
```

## Output Structure

```text
pipelines/source_fetch/data/runs/<run_id>/
  run_manifest.json               ← run metadata (`run_id`, start time, etc.)
  source_manifest.ndjson          ← per-source collection summary
  raw_responses/                  ← raw HTTP responses per source
  raw_items/                      ← parsed raw items per source
  normalized/
    documents.ndjson              ← normalized full document set (input to downstream stages)
    metrics.ndjson                ← collection metrics
    contract_report.json          ← field-coverage report
  labels/                         ← LLM and runtime labels (`llm_enrich` and later stages)
    company_decisions.ndjson      ← company-panel keep/drop + domain
    paper_domains.ndjson          ← paper-panel domain classification
    review_queue.ndjson           ← `needs_review` items
    llm_runs.ndjson               ← LLM execution log
    session_document_summaries.ndjson ← session-runtime document summary snapshots
    session_category_digests.ndjson   ← session-runtime category digest snapshots
    session_briefings.ndjson          ← session-runtime briefing snapshots
  logs/                           ← collection logs
    fetch.ndjson                  ← per-source fetch/normalize/filter/persist timing summary
    requests.ndjson               ← request-level timing log
```

## Contract Notes

- `documents.ndjson` keeps the same overall shape across sources even when the raw source information density differs.
- `discovery` explains novelty and emerging momentum.
- `ranking` provides the score and bucket used for live-monitor ordering.
- Documents with empty `reference_url`, `canonical_url`, and `url` are excluded from default serving.
- Each `source_manifest.ndjson` row includes timing summaries such as `duration_ms`, `fetch_duration_ms`, `request_count`, and `slowest_request_name`.
- `lmarena_overview` first discovers board links from the overview page, then reads the board-specific pages to structure full leaderboard rows.
- `raw_responses/`, `raw_items/`, `normalized/`, and `labels/` are canonical run artifacts. They must not be overwritten or hand-edited for demos, exports, or UI convenience.
- If a result is wrong, do not patch the existing run artifacts. Fix the source, parser, rule, or prompt and create a new run or a new label output.
- `labels/` is not just an offline enrichment directory. It also holds reusable LLM and runtime artifacts such as summary and briefing snapshots.

## Run Examples

default full run:

```bash
cd pipelines/source_fetch
. .venv/bin/activate
python scripts/data_collection.py --run-label full
```

wide run with higher cap:

```bash
cd pipelines/source_fetch
. .venv/bin/activate
python scripts/data_collection.py --limit 30 --run-label max
```

## Current Known Constraints

- GitHub is affected by unauthenticated rate limits.
- Some sources only expose around ten items because of feed structure.
- Source items without URLs are excluded from normalized documents.
- `data/runs/*` contains execution artifacts, not source code.

## Relationship To Other Docs

- Source selection lives in [02.1 Sources](./02_sections/02_1_sources.md).
- The normalized field contract lives in [02.2 Fields](./02_sections/02_2_fields.md).
- Redis session publish and dashboard serving live in [03. Runtime Flow](./03_runtime_flow.md).
- LLM filtering and classification live in [04. LLM Usage](./04_llm_usage.md).
- Current frontend visual and workspace rules live in [06. UI Design Guide](./06_ui_design_guide.md).
- Basic local run instructions currently live in the repository [README](../README.md).
