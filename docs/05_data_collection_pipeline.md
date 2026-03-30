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

## Scoring Criteria

### Design Principle

Freshness and engagement contribute to the final score at a **1:1 ratio**. Freshness caps at 50 points and engagement + source bonuses cap at 50 points, so items within the same freshness bucket are differentiated by engagement.

Scoring happens in two stages:

1. **Discovery Score (`spark_score`)** — measures "how noteworthy is this item right now?" Starts from a freshness base score and adds source/trending/engagement bonuses.
2. **Ranking Score (`feed_score`)** — the final score used for feed ordering. Takes spark_score, subtracts an age penalty, and adds an evergreen bonus for old-but-still-popular items.

### Stage 1: Discovery Score (`spark_score`, 0-100)

#### Freshness Score (max 50)

Computed from the difference between `sort_at` (publish/update time) and `fetched_at` (collection time). This becomes the base value of spark_score; all subsequent bonuses accumulate on top of it.

| `age_hours` range | `freshness_bucket` | score |
|---|---|---|
| ≤ 12h | `just_now` | 50 |
| ≤ 48h | `new` | 39 |
| ≤ 168h (7d) | `recent` | 25 |
| ≤ 720h (30d) | `active` | 11 |
| > 720h | `established` | 0 |

#### Source/Type Bonus

Certain sources or content types inherently signal higher relevance. For example, top positions on trending feeds receive rank-based bonuses. These bonuses are independent of each other and accumulate.

| Condition | Bonus |
|---|---|
| `hf_trending_models` or `trending` tag | +20 |
| Release/release_note + freshness ≤ recent | +10 |
| `trending_position` ≤ 3 / ≤ 10 / ≤ 20 | +12 / +7 / +3 |

#### Engagement Bonus

Based on popularity metrics (likes, score, comments, etc.) from the source. Each metric applies **multiple cumulative thresholds** — for example, likes = 200 yields `≥10(+4) + ≥50(+6) + ≥200(+8) = +18` points.

COMMUNITY items (HN, Reddit, etc.) do not receive source/type bonuses, so this engagement bonus is the primary differentiator for items within the same freshness bucket.

| Metric | Thresholds (cumulative) |
|---|---|
| `likes` | ≥10 +4, ≥50 +6, ≥200 +8, ≥500 +8 |
| `downloads` | ≥1K +5, ≥10K +10 |
| `stars` | ≥50 +5, ≥200 +8 |
| `score` | ≥10 +4, ≥50 +6, ≥200 +8 |
| `votes` | ≥500 +6, ≥2K +8 |
| `comments` | ≥5 +3, ≥20 +4, ≥50 +5 |

`spark_score = clamp(freshness + source_bonus + engagement_bonus, 0, 100)`

#### Spark Bucket

A UI-facing label derived from the spark_score range.

| Range | Bucket | Meaning |
|---|---|---|
| ≥ 80 | `sparkling` | Fresh and highly engaged |
| ≥ 60 | `rising` | Notable upward momentum |
| freshness ∈ {just_now, new} | `new` | Recently arrived |
| otherwise | `steady` | Stable |

### Stage 2: Ranking Score (`feed_score`, 0-100)

Takes the spark_score, applies a time-decay penalty, and adds an evergreen bonus to produce the **final score used for feed ordering**.

`feed_score = clamp(spark_score − age_penalty + evergreen_bonus, 0, 100)`

#### Age Penalty

Pushes items down the feed as they age, even if their spark_score was high. Values are **not cumulative** — the matching bracket overwrites previous ones. For example, age_hours = 100 produces a penalty of 12 (not 5 + 12).

| `age_hours` | Penalty |
|---|---|
| > 24h | −5 |
| > 72h | −12 |
| > 168h | −20 |
| > 720h | −30 |
| > 4,320h (180d) | −38 |

#### Evergreen Bonus

Prevents old items with exceptionally high engagement (e.g., a model with 1M+ downloads) from sinking into archive. Based on `engagement_primary` (the document's representative metric). Like age_penalty, values **overwrite** rather than accumulate.

| `engagement_primary.name` | Thresholds (overwrite) |
|---|---|
| `likes` | ≥100 → 4, ≥1K → 8, ≥10K → 12 |
| `downloads` | ≥10K → 4, ≥100K → 8, ≥1M → 12 |
| `stars` | ≥500 → 5, ≥5K → 10 |
| `score` / `votes` | ≥100 → 4, ≥1K → 8 |
| `comments` / `read_count` | ≥30 → 2, ≥100 → 4 |

#### Feed Bucket

Determines the feed display tier based on feed_score.

| Range | Bucket | Meaning |
|---|---|---|
| ≥ 80 | `top` | Top of feed |
| ≥ 55 | `live` | Active feed |
| ≥ 20 | `recent` | Standard |
| < 20 | `archive` | Bottom / archive |

### Example: COMMUNITY (GeekNews) items compared

Three GeekNews posts collected in the same freshness window (just_now, freshness = 50):

| Post | HN score | comments | spark_score | feed_score |
|---|---|---|---|---|
| A: popular | 200 | 50 | 50 + 4+6+8 + 3+4+5 = **80** | 80 (top) |
| B: moderate | 60 | 10 | 50 + 4+6 + 3 = **63** | 63 (live) |
| C: brand new | 5 | 2 | 50 + 0 + 0 = **50** | 50 (recent) |

Previously A, B, and C all scored 70. Now they range from 50 to 80 based on engagement.

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
