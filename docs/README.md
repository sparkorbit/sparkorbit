# SparkOrbit Docs

이 폴더가 현재 canonical 문서 루트다.

## Order

- [01. Overall Flow](./01_overall_flow.md)
- [02. Sections](./02_sections/README.md)
- [02.1 Sources](./02_sections/02_1_sources.md)
- [02.2 Fields](./02_sections/02_2_fields.md)
- [03. Runtime Flow](./03_runtime_flow_draft.md)
- [04. LLM Usage](./04_llm_usage.md)
- [05. Data Collection Pipeline](./05_data_collection_pipeline.md)
- [06. UI Design Guide](./06_ui_design_guide.md)

## Reading Guide

1. 먼저 `01`에서 제품 목표와 현재 구현 범위를 함께 본다.
2. source 선정과 수집 범위는 `02.1`, field contract는 `02.2`에서 본다.
3. source collection 자체는 `05`에서 본다.
4. backend, Redis session, SSE serving 흐름은 `03`에서 본다.
5. 현재 프론트엔드의 시각/상태 표현 규칙은 `06`에서 본다.
6. 요약/분류/LLM 활용은 `04`에서 보되, 현재 heuristic 기반 구현과 확장 방향을 함께 구분해서 본다.

## Reality Check

- 현재 저장소에는 `PoC/source_fetch` collection pipeline뿐 아니라 `backend/app` FastAPI runtime과 `src` React frontend도 구현돼 있다.
- canonical source of truth는 여전히 `PoC/source_fetch/data/runs/<run_id>/` 산출물이다.
- Redis는 세션 serving layer이고, frontend는 backend API/BFF만 사용한다.
