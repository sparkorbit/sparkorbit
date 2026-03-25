# SparkOrbit Docs

이 폴더가 현재 canonical 문서 루트다.

## Order

- [01. Overall Flow](./01_overall_flow.md) — 제품 목표와 현재 구현 범위
- [02. Sections](./02_sections/README.md) — 화면/섹션 관점 정리
- [02.1 Sources](./02_sections/02_1_sources.md) — source 선정과 수집 방법
- [02.2 Fields](./02_sections/02_2_fields.md) — normalized document 필드 레퍼런스
- [03. Runtime Flow](./03_runtime_flow_draft.md) — backend, Redis session, SSE serving 흐름
- [04. LLM Usage](./04_llm_usage.md) — offline enrichment와 session summary provider
- [05. Data Collection Pipeline](./05_data_collection_pipeline.md) — 구현된 수집 파이프라인
- [06. UI Design Guide](./06_ui_design_guide.md) — 현재 프론트엔드의 시각, 로딩, workspace 규칙
- [06. Operational Playbook](./06_operational_playbook.md) — setup / run / verification 절차
- [07. Panel Instruction Packs](./07_panel_instruction_packs.md) — panel별 prompt pack 관리 정책

## Reading Guide

1. 먼저 `01`에서 제품 목표와 **현재 구현 범위**를 함께 본다.
2. source 선정과 수집 범위는 `02.1`, field contract는 `02.2`에서 본다.
3. backend, Redis session, SSE flow는 `03`에서 본다.
4. 현재 구현된 collection flow는 `05`에서, frontend 시각과 로딩 규칙은 `06 UI Design Guide`에서 본다.
5. offline enrichment와 backend summary provider 범위는 `04`에서 본다.
6. 실제 setup / run / verification 절차는 항상 `06 Operational Playbook`에서 canonical하게 관리한다.
7. panel별 prompt/instruction 설계는 `07`과 `docs/prompt_packs/` 아래에서 관리한다.

## Reality Check

- 현재 저장소에는 `PoC/source_fetch`뿐 아니라 `backend/app` FastAPI runtime과 `src` React frontend도 구현되어 있다.
- canonical source of truth는 여전히 `PoC/source_fetch/data/runs/<run_id>/` 산출물이다.
- Redis는 세션 serving layer이고, frontend는 backend API/BFF만 사용한다.
