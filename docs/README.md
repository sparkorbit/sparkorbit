# SparkOrbit Docs

이 폴더가 현재 canonical 문서 루트다.

## Order

- [01. Overall Flow](./01_overall_flow.md) — 제품 목표와 현재 구현 범위
- [02. Sections](./02_sections/README.md) — 화면/섹션 관점 정리
- [02.1 Sources](./02_sections/02_1_sources.md) — source 선정과 수집 방법
- [02.2 Fields](./02_sections/02_2_fields.md) — normalized document 필드 레퍼런스
- [03. Runtime Flow Draft](./03_runtime_flow_draft.md) — target architecture 초안 (미구현)
- [04. LLM Usage](./04_llm_usage.md) — LLM enrichment 설계와 현재 구현
- [05. Data Collection Pipeline](./05_data_collection_pipeline.md) — 구현된 수집 파이프라인
- [06. Operational Playbook](./06_operational_playbook.md) — setup / run / verification 절차
- [07. Panel Instruction Packs](./07_panel_instruction_packs.md) — panel별 prompt pack 관리 정책

## Reading Guide

<!-- ────────────────────────────────────────────
     처음 읽는 사람을 위한 순서 가이드.
     "구현된 것"과 "목표 설계"를 혼동하지 않도록 안내.
     ──────────────────────────────────────────── -->

1. 먼저 `01`에서 제품 목표와 **현재 구현 범위**를 함께 본다.
2. source 선정과 수집 범위는 `02.1`, field contract는 `02.2`에서 본다.
3. 현재 구현된 PoC collection flow는 `05`에서 본다.
4. LLM enrichment(company filter, paper domain)는 `04`에서 본다. — **현재 두 단계가 구현 완료**.
5. 실제 setup / run / verification 절차는 항상 `06`에서 canonical하게 관리한다.
6. panel별 prompt/instruction 설계는 `07`과 `docs/prompt_packs/` 아래에서 관리한다.
7. target runtime / storage / serving 초안은 `03`에서 보되, 아직 미구현이라는 점을 함께 본다.
