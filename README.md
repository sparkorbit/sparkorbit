# SparkOrbit

AI/Tech 정보를 한 화면에서 탐색하는 `Open World Agents` 기반 world monitor 프로젝트다.

현재 저장소에는 아래 세 층이 구현돼 있다.

- `PoC/source_fetch`: source collection pipeline
- `backend/app`: FastAPI backend + Redis session runtime
- `src`: React dashboard frontend

canonical source of truth는 여전히 `PoC/source_fetch/data/runs/<run_id>/` 아래의 JSONL/JSON run output다. Redis는 현재 세션을 빠르게 서빙하기 위한 layer이고, frontend는 backend API/BFF만 사용한다.

## Docs Map

- [docs/README.md](./docs/README.md)
  canonical 문서 루트
- [docs/01_overall_flow.md](./docs/01_overall_flow.md)
  제품 전체 흐름, 현재 구현 범위, 실제 user flow
- [docs/02_sections/02_1_sources.md](./docs/02_sections/02_1_sources.md)
  canonical source list
- [docs/02_sections/02_2_fields.md](./docs/02_sections/02_2_fields.md)
  normalized field contract
- [docs/03_runtime_flow_draft.md](./docs/03_runtime_flow_draft.md)
  backend, Redis session, SSE serving flow
- [docs/04_llm_usage.md](./docs/04_llm_usage.md)
  LLM 요약 레이어와 확장 방향
- [docs/05_data_collection_pipeline.md](./docs/05_data_collection_pipeline.md)
  canonical collection pipeline 설명
- [docs/06_ui_design_guide.md](./docs/06_ui_design_guide.md)
  current frontend visual/loading guide

## Current Implementation

- collection entrypoint는 [PoC/source_fetch/scripts/data_collection.py](./PoC/source_fetch/scripts/data_collection.py) 다.
- backend entrypoint는 [backend/app/main.py](./backend/app/main.py), CLI는 [backend/app/cli.py](./backend/app/cli.py) 다.
- frontend main app은 [src/App.tsx](./src/App.tsx) 다.
- homepage 진입 시 active session이 없으면 backend가 실제 collection을 시작하고, frontend는 SSE로 로딩 단계를 실시간 표시한다.
- `reload session`을 누르면 새 run을 다시 수집하고 Redis active session을 교체한다.

## Quick Start

### 1. Collection only

```bash
cd PoC/source_fetch
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock.txt
python scripts/data_collection.py --run-label full
```

### 2. Full local stack with Docker

```bash
docker compose up --build
```

주소:

- frontend: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- backend health: [http://127.0.0.1:8787/api/health](http://127.0.0.1:8787/api/health)
- redis: `127.0.0.1:6379`

## Runtime Notes

- frontend는 `/api/dashboard/stream`과 `/api/sessions/reload/stream` SSE를 사용한다.
- 새로고침 중 reload가 진행 중이면 frontend가 `/api/sessions/reload` state를 다시 읽어 fullscreen loader를 복구한다.
- worker 컨테이너는 queue 기반 enrichment를 위한 sidecar이고, homepage bootstrap/reload는 현재 API background task 안에서 enrichment까지 바로 처리한다.

## Product Goal

- summary, source feed, benchmark, session runtime 상태를 한 화면에서 본다.
- source feed는 섞지 않고 source별로 유지한다.
- 여러 source를 주제 기준으로 묶는 일은 digest/summary 레이어에서만 한다.
- summary를 클릭하면 관련 문서와 실제 원문 URL, 짧은 요약, 세부 정보가 함께 열린다.

## PoC

- [PoC/README.md](./PoC/README.md)
  실험용 구현과 테스트 하네스 모음
