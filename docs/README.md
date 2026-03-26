# SparkOrbit Docs

Technical documentation root for the SparkOrbit project.

***

## Tech Stack

| Category | Technologies |
|----------|-------------|
| Frontend | React 19, Vite, Tailwind CSS, Inter + Pretendard + JetBrains Mono |
| Backend | FastAPI, Redis, Server-Sent Events |
| Collection | Python 3.13 async pipeline (httpx, feedparser, BeautifulSoup) |
| LLM | Ollama + Qwen 3.5 4B (local, optional) |
| Deployment | Docker Compose (frontend, backend, worker, redis, ollama) |

***

## Documentation Index

| Doc | Description |
|-----|-------------|
| [Overall Flow](./01_overall_flow.md) | Product flow, user journey, implementation scope |
| [Sources](./02_sections/02_1_sources.md) | Complete source list and adapters |
| [Fields](./02_sections/02_2_fields.md) | Normalized data contract |
| [Runtime Flow](./03_runtime_flow_draft.md) | Backend, Redis session, SSE serving |
| [LLM Usage](./04_llm_usage.md) | Summary provider, paper classifier, company filter |
| [Collection Pipeline](./05_data_collection_pipeline.md) | Pipeline architecture and run artifacts |
| [UI Design Guide](./06_ui_design_guide.md) | Visual tokens, loading states, workspace layout |
| [Operational Playbook](./06_operational_playbook.md) | Setup, run, and verification runbook |
| [Panel Instruction Packs](./07_panel_instruction_packs.md) | Panel-level prompt pack management |
| [Data Schema & Links](./08_data_schema_and_links.md) | Data schema, join keys, merge rules |

***

## Reading Guide

1. Start with [Overall Flow](./01_overall_flow.md) for the product goal and current scope.
2. Source list and collection: [Sources](./02_sections/02_1_sources.md), field contract: [Fields](./02_sections/02_2_fields.md).
3. Backend, Redis session, SSE: [Runtime Flow](./03_runtime_flow_draft.md).
4. Collection pipeline: [Data Collection](./05_data_collection_pipeline.md), frontend rules: [UI Design Guide](./06_ui_design_guide.md).
5. LLM enrichment and summary: [LLM Usage](./04_llm_usage.md).
6. Setup and run procedures: [Operational Playbook](./06_operational_playbook.md).
