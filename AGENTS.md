# SparkOrbit - Agent Guide

## Read First

1. `CLAUDE.md`
2. `docs/01_overall_flow.md`
3. `docs/02_sections/02_1_sources.md`
4. `docs/02_sections/02_2_fields.md`
5. `docs/05_data_collection_pipeline.md`

## Current Code Reality

- The real implementation is the `pipelines/source_fetch` collection pipeline.
- The official CLI entrypoint is `pipelines/source_fetch/scripts/data_collection.py`.
- The core implementation lives in `adapters.py`, `models.py`, and `pipeline.py`.
- Redis and the UI are still only documented in the target architecture.

## Core Principles

1. Works immediately after install.
2. Use free services only.
3. Prefer sources that do not require authentication.
4. Keep it simple, in hackathon style.
5. Any UI text visible to people must prioritize human readability.

## Working Rules

- Keep each source adapter independent.
- Skip HTTP errors and parsing failures, then move on to the next source.
- Normalize dates to ISO 8601 in UTC.
- Exclude documents without a URL from the default serving set.
- Preserve field shape in the normalized contract.
- Treat priority as `discovery + engagement + ranking`.
- Do not mix the real implementation with the target architecture docs.
- Treat `raw_responses/`, `raw_items/`, `normalized/`, and `labels/` under `pipelines/source_fetch/data/runs/<run_id>/` as canonical artifacts. Do not overwrite or edit them arbitrarily for demos or presentation convenience.
- Treat LLM-generated `company_decisions`, `paper_domains`, briefing, digest, and category summary as reusable outputs. If a different tone or length is needed, regenerate them by changing the prompt or code, not by manually editing stored values.
- Frontend and exports may only reformat summaries with line breaks or section splits. Paraphrasing, manual rewriting, or silent replacement that changes meaning is not allowed.
- Operator-facing labels, panel titles, and source names must not expose raw identifiers directly. Use human-readable display names such as `[Paper] ARXIV - AI` or `Hugging Face - New Models` instead of internal names like `arxiv_rss_cs_ai` or `hf_models_new`.
- Keep transport and category tokens such as `rss`, `api`, and `cs_ai` in internal implementation identifiers only. Replace them with curated display names in the user UI.
- After any code correction that changes the monitor, update both the backend payload/build logic and the frontend monitor rendering in the same change. Do not leave the dashboard showing stale labels, stale fields, or mismatched behavior between API and UI.
