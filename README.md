# SparkOrbit

AI/Tech 정보를 한 화면에서 탐색하는 `Open World Agents` 기반 world monitor 프로젝트다.
현재 저장소에서 실제로 구현된 코드는 `PoC/source_fetch` collection pipeline과, 그 run output을 소비하는 `PoC/llm_enrich` local LLM runner다. Redis/UI까지 포함한 구조는 아직 target architecture 문서 단계에 있다.

GitHub를 이 프로젝트의 **문서 source of truth**로 사용한다.
기획/리서치/LLM 활용 문서는 Markdown 기준으로 관리하고, Notion은 필요할 때만 파생본으로 만든다.
실행 절차 역시 Markdown으로 관리하며, canonical 절차는 `docs/06_operational_playbook.md` 에 둔다.

## Docs Map

- [docs/README.md](./docs/README.md)
  canonical 문서 루트
- [docs/01_overall_flow.md](./docs/01_overall_flow.md)
  제품 전체 흐름, 화면 구조, 핵심 원칙
- [docs/02_sections/02_1_sources.md](./docs/02_sections/02_1_sources.md)
  canonical source list
- [docs/02_sections/02_2_fields.md](./docs/02_sections/02_2_fields.md)
  normalized field contract
- [docs/03_runtime_flow_draft.md](./docs/03_runtime_flow_draft.md)
  target runtime / storage / serving 초안
- [docs/04_llm_usage.md](./docs/04_llm_usage.md)
  LLM 요약 레이어, drill-down UX, prompt pack, reference 원칙
- [docs/05_data_collection_pipeline.md](./docs/05_data_collection_pipeline.md)
  현재 구현된 PoC data collection pipeline 설명
- [docs/06_operational_playbook.md](./docs/06_operational_playbook.md)
  setup / run / verification 절차의 canonical runbook
- [docs/07_panel_instruction_packs.md](./docs/07_panel_instruction_packs.md)
  panel별 instruction pack 관리 원칙과 canonical pack 목록

## Reality Check

- 지금 코드로 바로 실행되는 것은 `PoC/source_fetch` collection pipeline과 `PoC/llm_enrich` company filter runner다.
- Redis, LLM enrichment runtime, UI, `docker compose up` 기반 전체 시스템은 아직 목표 구조 문서다.
- 구현된 동작을 확인할 때는 `README -> docs/05 -> PoC/source_fetch/scripts/data_collection.py -> PoC/llm_enrich/scripts/llm_enrich.py` 순서로 보면 가장 덜 헷갈린다.

## Current Implementation

- collection entrypoint는 [PoC/source_fetch/scripts/data_collection.py](./PoC/source_fetch/scripts/data_collection.py) 이다.
- LLM enrichment entrypoint는 [PoC/llm_enrich/scripts/llm_enrich.py](./PoC/llm_enrich/scripts/llm_enrich.py) 이다.
- 수집 결과는 `PoC/source_fetch/data/runs/<run_id>/` 아래에 `raw + normalized + sample + logs`로 저장된다.
- LLM enrichment 결과는 같은 run 디렉터리의 `enriched/` 아래에 추가된다.
- collection 핵심 구현 파일은 `adapters.py`, `models.py`, `pipeline.py`다.

## Quick Start

```bash
git clone https://github.com/sparkorbit/documents-planning.git
cd documents-planning/PoC/source_fetch
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock.txt
python scripts/data_collection.py --profile sample --run-label sample
```

설치 확인이 끝나면 기본 `full` 실행으로 넓게 모아볼 수 있다.

```bash
python scripts/data_collection.py --run-label full
```

## Product Goal

- Open World Agents 메인 화면에서 여러 패널을 동시에 본다.
- source feed는 섞지 않고, Reddit / HN / Papers / Company / OSS / Benchmark를 각각 따로 보여준다.
- LLM은 summary / cluster / digest 레이어에서만 여러 source를 주제 기준으로 묶는다.
- summary를 클릭하면 관련 문서와 실제 원문 URL, 짧은 요약, 세부 요약이 함께 펼쳐진다.

## Target Architecture

- Redis + collector + enricher + UI가 함께 동작하는 구조를 목표로 한다.
- 이 목표 형태는 [docs/03_runtime_flow_draft.md](./docs/03_runtime_flow_draft.md) 에 정리돼 있다.
- 현재 repo에서 구현 완료된 부분은 위의 `Current Implementation`에 적은 collection pipeline이다.

## PoC

- [PoC/README.md](./PoC/README.md)
  실험용 구현과 테스트 하네스 모음
