# SparkOrbit

AI/Tech 정보를 한 화면에서 탐색하는 `Open World Agents` 기반 world monitor 프로젝트다.

현재 저장소에는 아래 네 층이 함께 있다.

- `pipelines/source_fetch`: source collection pipeline
- `backend/app`: FastAPI backend + Redis session runtime
- `src`: React dashboard frontend
- `pipelines/llm_enrich`: local LLM labeling tooling

canonical source of truth는 여전히 `pipelines/source_fetch/data/runs/<run_id>/` 아래의 JSONL/JSON run output이다. Redis는 현재 세션을 빠르게 서빙하기 위한 materialized session layer이고, frontend는 backend API/BFF만 사용한다.

GitHub를 이 프로젝트의 문서 source of truth로 사용한다. 기획, 리서치, 런타임 설명, 디자인 가이드, 실행 절차를 Markdown 기준으로 유지한다.

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
  offline LLM labels와 session summary provider의 현재 범위
- [docs/05_data_collection_pipeline.md](./docs/05_data_collection_pipeline.md)
  canonical collection pipeline 설명
- [docs/06_ui_design_guide.md](./docs/06_ui_design_guide.md)
  current frontend visual, loading, workspace guide
- [docs/06_operational_playbook.md](./docs/06_operational_playbook.md)
  setup, run, verification 절차의 canonical runbook
- [docs/07_panel_instruction_packs.md](./docs/07_panel_instruction_packs.md)
  panel별 instruction pack 관리 원칙과 canonical pack 목록

## Reality Check

- collection run output가 canonical artifact다.
- backend, frontend, worker, Redis는 기본 `docker compose`로 띄우고, local LLM bundle은 선택적으로 함께 붙일 수 있다.
- homepage 진입 시 active session이 없으면 backend가 실제 collection을 시작하고, frontend는 SSE fullscreen loader로 진행 단계를 보여준다.
- `pipelines/llm_enrich`는 별도 오프라인 LLM labeling tooling이고, homepage summary/digest는 backend session runtime이 담당한다.

## Current Implementation

- collection entrypoint는 [pipelines/source_fetch/scripts/data_collection.py](./pipelines/source_fetch/scripts/data_collection.py) 다.
- backend entrypoint는 [backend/app/main.py](./backend/app/main.py), CLI는 [backend/app/cli.py](./backend/app/cli.py) 다.
- frontend main app은 [src/App.tsx](./src/App.tsx) 다.
- homepage bootstrap은 `/api/dashboard/stream`에서 자동 시작되고, reload는 `/api/sessions/reload`와 `/api/sessions/reload/stream`을 사용한다.
- leaderboards는 `/api/leaderboards`와 메인 패널의 leaderboard workspace로 노출된다.
- local LLM tooling entrypoint는 [pipelines/llm_enrich/scripts/llm_enrich.py](./pipelines/llm_enrich/scripts/llm_enrich.py), [pipelines/llm_enrich/scripts/paper_enrich.py](./pipelines/llm_enrich/scripts/paper_enrich.py) 다.

## Quick Start

### 1. Collection only

```bash
git clone https://github.com/sparkorbit/sparkorbit.git
cd sparkorbit/pipelines/source_fetch
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock.txt
python scripts/data_collection.py --limit 1 --run-label quickstart
```

설치 확인이 끝나면 기본 `full` 실행으로 넓게 모아볼 수 있다.

```bash
python scripts/data_collection.py --run-label full
```

### 2. Full local stack with Docker

```bash
bash scripts/docker-up.sh
```

스크립트가 `Ollama + qwen3.5:4b` bundle을 포함할지 한 번 묻는다. 포함하면 첫 실행에서 모델 pull 때문에 시간이 꽤 걸릴 수 있다.

TTY가 없는 실행 환경에서는 기본값이 `without-llm` 이다. 질문 없이 고정하고 싶다면 `bash scripts/docker-up.sh --with-llm` 또는 `bash scripts/docker-up.sh --without-llm` 를 쓴다.

직접 실행하고 싶다면:

```bash
# 앱만
docker compose up --build

# 앱 + local LLM bundle
docker compose -f docker-compose.yml -f docker-compose.llm.yml up --build
```

LLM bundle을 포함해도 model pull이 늦거나 실패하면 앱 스택은 그대로 올라오고, LLM 관련 단계만 조용히 pass된다.

주소:

- frontend: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- backend health: [http://127.0.0.1:8787/api/health](http://127.0.0.1:8787/api/health)
- redis: `127.0.0.1:6380`
- ollama tags: `http://127.0.0.1:11434/api/tags` (LLM bundle 포함 시)

필요하면 Redis host port는 `SPARKORBIT_REDIS_HOST_PORT`, Ollama host port는 `SPARKORBIT_OLLAMA_HOST_PORT`로 바꿀 수 있다.

## Runtime Notes

- frontend는 `/api/dashboard/stream`과 `/api/sessions/reload/stream` SSE를 우선 사용한다.
- reload 중 새로고침이 일어나도 frontend가 `/api/sessions/reload` state를 읽어 fullscreen loader를 복구한다.
- backend summary provider는 `SPARKORBIT_SUMMARY_PROVIDER` 환경 변수로 선택한다. 기본값은 `noop`이고, `heuristic` provider도 포함돼 있다.
- worker 컨테이너는 queue 기반 summary/digest sidecar이고, homepage bootstrap과 reload는 현재 API background task 경로에서도 끝까지 진행된다.

## Product Goal

- summary, source feed, leaderboard, session runtime 상태를 한 화면에서 본다.
- source feed는 섞지 않고 source별로 유지한다.
- 여러 source를 주제 기준으로 묶는 일은 digest/summary 레이어에서만 한다.
- summary를 클릭하면 관련 문서와 실제 원문 URL, document detail이 함께 열린다.

## Pipelines

- [pipelines/README.md](./pipelines/README.md)
  데이터 수집 및 LLM 판정/분류 파이프라인
