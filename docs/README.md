<p align="center">
  <a href="./README.md">🇺🇸 English</a> · <a href="./README.ko.md">🇰🇷 한국어</a>
</p>

# SparkOrbit Docs

Technical documentation root for the SparkOrbit project.

***

## Language Policy

- English is the primary documentation language going forward.
- Korean translations are managed separately when available, using parallel `.ko.md` files.
- Some detailed docs are still older Korean-first drafts. Those pages will be migrated gradually to the English-first structure instead of being silently mixed long-term.

***

## Tech Stack

| Category | Technologies |
|----------|-------------|
| Frontend | React 19, Vite, Tailwind CSS, Inter + Pretendard + JetBrains Mono |
| Backend | FastAPI, Redis, HTTP polling |
| Collection | Python 3.13 async pipeline (httpx, feedparser, BeautifulSoup) |
| LLM | Ollama + Qwen 3.5 4B (local, optional) |
| Deployment | Docker Compose (frontend, backend, worker, redis, ollama) |

***

## Documentation Index

| Doc | Description |
|-----|-------------|
| [Overall Flow](./01_overall_flow.md) | Product flow, user journey, implementation scope |
| [Sections](./02_sections/README.md) | Sources and field-contract entry point |
| [Sources](./02_sections/02_1_sources.md) | Complete source list and adapters |
| [Fields](./02_sections/02_2_fields.md) | Normalized data contract, field semantics, ranking rules |
| [Runtime Flow](./03_runtime_flow_draft.md) | Backend, Redis session, polling-based serving |
| [LLM Usage](./04_llm_usage.md) | Summary provider, paper classifier, company filter |
| [Collection Pipeline](./05_data_collection_pipeline.md) | Pipeline architecture and run artifacts |
| [UI Design Guide](./06_ui_design_guide.md) | Visual tokens, loading states, workspace layout |
| [Panel Instruction Packs](./07_panel_instruction_packs.md) | Panel-level prompt pack management |
| [Data Schema & Links](./08_data_schema_and_links.md) | Data schema, join keys, merge rules |

***

## Reading Guide

1. For the product goal and current scope, read [Overall Flow](./01_overall_flow.md).
2. Source list and collection: [Sources](./02_sections/02_1_sources.md), field contract: [Fields](./02_sections/02_2_fields.md).
3. Backend, Redis session, and polling flow: [Runtime Flow](./03_runtime_flow_draft.md).
4. Collection pipeline: [Data Collection](./05_data_collection_pipeline.md), frontend rules: [UI Design Guide](./06_ui_design_guide.md).
5. LLM enrichment and summary: [LLM Usage](./04_llm_usage.md).

## Migration Note

- The index and language policy are now English-first.
- The English-first rewrite is complete for `01`, `02.1`, `03`, `05`, and `07`.
- `02.2`, `04`, `06`, and `08` still contain older shared-draft sections and will be rewritten next.
