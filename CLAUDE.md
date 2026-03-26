# SparkOrbit - Working Notes

## Project Direction

SparkOrbit is an Open World Agents-based world monitor for exploring AI and tech information in one place.

## Read First

1. `docs/01_overall_flow.md`
2. `docs/02_sections/02_1_sources.md`
3. `docs/02_sections/02_2_fields.md`
4. `docs/03_runtime_flow_draft.md`
5. `docs/05_data_collection_pipeline.md`
6. `docs/06_ui_design_guide.md`
7. `docs/04_llm_usage.md`

## Current Code Scope

### Data Collection

- `pipelines/source_fetch/scripts/data_collection.py` - single CLI entrypoint
- `pipelines/source_fetch/scripts/source_fetch/adapters.py` - source-specific fetch and parse logic
- `pipelines/source_fetch/scripts/source_fetch/models.py` - dataclasses
- `pipelines/source_fetch/scripts/source_fetch/pipeline.py` - orchestration

### Backend Runtime

- `backend/app/main.py` - FastAPI app entrypoint
- `backend/app/api/routes/dashboard.py` - dashboard, digest, document, SSE
- `backend/app/api/routes/sessions.py` - reload state, reload stream
- `backend/app/api/routes/leaderboards.py` - leaderboard overview
- `backend/app/services/session_service.py` - bootstrap, reload, publish, digest
- `backend/app/services/collector.py` - wrapper around `pipelines/source_fetch`
- `backend/app/services/summary_provider.py` - summary provider abstraction

### Frontend

- `src/App.tsx` - dashboard, fullscreen loading, reload recovery, settings
- `src/components/dashboard/PanelWorkspace.tsx` - workspace layout
- `src/components/dashboard/SourcePanel.tsx` - source feed panel
- `src/components/dashboard/SummaryPanel.tsx` - category digest panel
- `src/lib/dashboardApi.ts` - BFF API client and SSE hooks
- `src/index.css` - visual tokens, loader, reveal motion

### LLM Enrichment

- `pipelines/llm_enrich/scripts/llm_enrich.py` - company filter
- `pipelines/llm_enrich/scripts/paper_enrich.py` - paper domain classifier
- `docs/prompt_packs/` - prompt-pack documentation with a 1:1 code mapping

## Runtime Layer Separation

- The canonical artifact is always the run output under `pipelines/source_fetch/data/runs/<run_id>/`.
- Redis is not long-term storage. It is a materialized layer for serving the current session quickly.
- The frontend does not read JSONL run output directly. It uses only the backend API/BFF.
- Homepage bootstrap and manual reload currently connect collection, publish, and digest generation through the backend.
- `pipelines/llm_enrich` is separate offline LLM labeling tooling, while the homepage summary lane is produced by the backend session runtime.

## Output Paths

```text
pipelines/source_fetch/data/runs/<run_id>/
  normalized/
    documents.ndjson         <- collected source data for all documents
  labels/
    company_decisions.ndjson <- company filter output
    paper_domains.ndjson     <- paper domain output
    review_queue.ndjson      <- needs_review items
    llm_runs.ndjson          <- execution log (append-only)
    session_document_summaries.ndjson <- session runtime document summary snapshot
    session_category_digests.ndjson   <- session runtime category digest snapshot
    session_briefings.ndjson          <- session runtime briefing snapshot
```

## Artifact Immutability

- `raw_responses/`, `raw_items/`, `normalized/documents.ndjson`, and `labels/*.ndjson` are canonical run artifacts.
- These values can be reused later for verification, drill-down, reprocessing, and export, so do not overwrite or edit them manually for demos or UI presentation.
- LLM/runtime outputs such as briefings, digests, and category summaries are also reusable outputs, not temporary display text.
- If you need different tone, length, or priority, change the prompt pack, selection rule, or provider code, then regenerate with a new `prompt_version` or run metadata.
- The frontend and export layers may only do formatting such as line breaks, section splits, or truncation. They must not paraphrase, manually rewrite, or silently replace the stored summary content.

## Core Principles

1. Works immediately after installation
2. Use free resources only
3. Prefer sources that do not require authentication
4. Keep it simple for a hackathon
5. Any human-facing name must be human-readable

## Panel Structure

| Panel | Current Owner | Source |
|------|---------------|--------|
| Papers | runtime digest + source feed | arXiv 8 feeds + HF daily papers |
| Models | runtime digest + source feed | HF models likes/new/trending |
| Company | filter + source feed | company blogs + hf_blog, excluding `github_*` |
| Community | source feed | HN, Reddit, github_curated_repos |
| Benchmark | leaderboard + source feed | LMArena, Open LLM Leaderboard |
| Summary | category digest | aggregate of the panels above |

## LLM Output Format

Code must follow these formats exactly.

### Company Filter -> `labels/company_decisions.ndjson`

```json
{
  "document_id": "openai_news_rss:gpt5-turbo",
  "filter_scope": "company_panel",
  "decision": "keep",
  "company_domain": "model_release",
  "reason_code": "model_signal",
  "model_name": "qwen3.5:4b",
  "runtime": "ollama",
  "prompt_version": "company_filter_v2",
  "schema_version": "document_filter_v2",
  "generated_at": "2026-03-24T09:44:14Z"
}
```

`decision` enum: `keep | drop | needs_review`

`company_domain` enum, when `decision` is not `drop`:
`model_release | product_update | technical_research | open_source | benchmark_eval | partnership_ecosystem | policy_safety | others`

`reason_code` enum:
`model_signal | product_signal | research_signal | oss_signal | benchmark_signal | partnership_signal | policy_signal | other_signal | event_or_program | recruiting_or_pr | general_promo | unclear_scope | runtime_fallback`

### Paper Domain -> `labels/paper_domains.ndjson`

```json
{
  "document_id": "arxiv_rss_cs_ai:2603.19429",
  "filter_scope": "paper_panel",
  "paper_domain": "agents",
  "model_name": "qwen3.5:4b",
  "runtime": "ollama",
  "prompt_version": "paper_domain_v1",
  "schema_version": "paper_domain_v1",
  "generated_at": "2026-03-24T10:00:00Z"
}
```

`paper_domain` enum:
`llm | vlm | diffusion | agents | reasoning | rlhf_alignment | safety | rag_retrieval | efficient_inference | finetuning | evaluation | nlp | speech_audio | robotics_embodied | video | 3d_spatial | graph_structured | continual_learning | federated_privacy | medical_bio | science | others`

### LLM Input Format

Company: `{"id": "...", "src": "...", "title": "...", "desc": "first 200 characters, when available"}`
Paper: `{"id": "...", "title": "..."}`

The frontend joins `document_id` back to the original `documents.ndjson` file to render metadata. The LLM does not rebuild date, URL, engagement, or ordering.

## LLM Pipeline Baselines

| Item | Company | Paper |
|------|---------|-------|
| Model | qwen3.5:4b | qwen3.5:4b |
| Runtime | Ollama | Ollama |
| `num_ctx` | 131072 | 131072 |
| Pre-LLM filter | 90 days, 5 items per source, exclude `github_*` | none, because RSS is already recent |
| Input count | 68 items (16 sources) | 180 items (9 sources) |
| `chunk_size` | 30 | 100 |
| Elapsed time | about 46 seconds | about 185 seconds |

## Working Rules

- Keep each source adapter independent.
- Skip HTTP errors and parse failures, then move on to the next source.
- Normalize dates to ISO 8601 in UTC at collection time.
- Exclude documents without URLs from the default serving set.
- Keep the normalized contract shape stable. Use `null`, `[]`, or `{}` when values are missing.
- Keep the numeric values, enums, field names, and loading stages aligned between the documentation (`docs/`) and code (`pipelines/`, `backend/app`, `src`). Update them together when they change.
- Treat summaries and briefings as reusable outputs. Do not manually edit summary text to make it look better; change the generation rules and regenerate instead.
- Do not show raw source identifiers directly in operator-facing UI. Use curated display names such as `[Paper] ARXIV - AI`, `OpenAI - News`, and `Hugging Face - New Models` instead of internal names like `arxiv_rss_cs_ai`, `openai_news_rss`, or `hf_models_new`.
- Do not expose transport or internal tokens such as `rss`, `api`, `overview`, or `cs_ai` directly in UI titles, badges, or panel names.
