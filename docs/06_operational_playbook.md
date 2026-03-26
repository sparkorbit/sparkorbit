[Index](./README.md) · [01. Overall Flow](./01_overall_flow.md) · [02. Sections](./02_sections/README.md) · [03. Runtime Flow](./03_runtime_flow_draft.md) · [04. LLM Usage](./04_llm_usage.md) · [05. Data Collection Pipeline](./05_data_collection_pipeline.md) · [06. UI Design Guide](./06_ui_design_guide.md) · **06. Operational Playbook**

---

# SparkOrbit - 06. Operational Playbook

> Canonical runbook for setup and execution
> Last updated: 2026-03-25

## 0. Rule

이 문서는 현재 repo에서 실제로 사람이 따라 하는 **운영 절차의 source of truth** 다.

다음이 바뀌면 이 문서를 같이 수정한다.

- 설치 방법
- Docker 실행 방법
- 로컬 LLM 모델 / 런타임
- 실행 커맨드
- 출력 경로
- 검증 방법

다른 `README.md` 파일은 이 문서를 요약하거나 링크할 수는 있지만, 절차의 canonical 정의를 대체하지 않는다.

## 1. Current Scope

현재 실제로 usable 하게 맞춘 절차는 아래 네 단계다.

1. `pipelines/source_fetch` 데이터 수집
2. `pipelines/llm_enrich` 에서 `Ollama + qwen3.5:4b` 기반 company filter 판정
3. `pipelines/llm_enrich` 에서 `Ollama + qwen3.5:4b` 기반 paper domain classification
4. `docker compose` 기반 `redis + backend + worker + frontend` 로컬 스택 실행
5. 필요하면 `Ollama + qwen3.5:4b` bundle을 같은 Docker 실행에 추가

아직 이 문서에 없는 절차는 공식 운영 절차로 간주하지 않는다.

## 2. Environment Setup

Node 기반 frontend tooling (`npm install`, `npm run build`, `npm run dev`) 은 Node `^20.19.0 || >=22.12.0` 를 요구한다. 전체 앱 Docker 빌드는 `frontend/Dockerfile` 에서 `node:22-alpine` 을 사용하므로 Linux, macOS, Windows host에서 동일하게 동작한다. `@rolldown/binding-*`, `@tailwindcss/oxide-*` 같은 플랫폼별 바이너리는 root direct dependency로 고정하지 않고 transitive optional dependency로만 둔다.

Collection 작업 루트:

```bash
cd pipelines/source_fetch
```

Python 환경:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock.txt
```

## 3. Collection Run

간단 실행:

```bash
python scripts/data_collection.py --limit 1 --run-label quickstart
```

기본 full 실행:

```bash
python scripts/data_collection.py --run-label full
```

산출물은 아래에 저장된다.

```text
data/runs/<run_id>/
  raw_responses/
  raw_items/
  normalized/
  logs/
```

LLM 판정/분류 작업 루트:

```bash
cd pipelines/llm_enrich
```

Python 환경:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock.txt
```

## 4. Local LLM Setup

전체 앱 스택을 띄울 목적이면 이 단계를 먼저 따로 할 필요는 없다. 루트 `bash scripts/docker-up.sh` 가 local LLM bundle 포함 여부를 한 번 묻고, 포함 시 Ollama 컨테이너와 기본 모델 pull까지 함께 처리한다.

아래 절차는 `pipelines/llm_enrich` 만 단독으로 돌리거나, Ollama만 별도로 올리고 싶을 때의 standalone setup이다.

현재 기본 런타임:

- runtime: `Ollama`
- model: `qwen3.5:4b`
- serving: local GPU
- API: local HTTP

현재 기본 sampling baseline:

- `temperature=0.7`
- `top_p=0.8`
- `top_k=20`
- `min_p=0.0`
- `repeat_penalty=1.0`

참고:

- 이 값은 HF `Qwen3.5-4B`의 non-thinking best practices를 기준으로 둔다
- `presence_penalty=1.5` 는 Ollama native chat options에서 1:1 대응이 없어 reference 값으로만 문서에 남긴다

Docker 기반 셋업:

```bash
bash scripts/setup_ollama_docker.sh
```

수동 실행:

```bash
docker compose -f docker-compose.ollama.yml up -d
docker exec sparkorbit-ollama ollama pull qwen3.5:4b
```

API 확인:

```bash
curl http://localhost:11434/api/tags
```

## 4-b. Full Local Stack

저장소 루트에서 아래 명령으로 frontend, backend, redis, worker를 띄운다. 스크립트가 local LLM bundle 포함 여부를 한 번 묻는다.

```bash
bash scripts/docker-up.sh
```

macOS/Windows에서 Bash 스크립트 대신 Docker Desktop/Engine만으로 실행하고 싶다면 아래 `docker compose up --build` 경로를 그대로 사용하면 된다.

LLM bundle을 포함하면 첫 실행은 `qwen3.5:4b` model pull까지 같이 진행하므로 몇 분 걸릴 수 있다.

TTY가 없는 환경에서는 기본값이 `without-llm` 이다. 질문 없이 고정하고 싶으면 아래처럼 직접 지정한다.

```bash
bash scripts/docker-up.sh --with-llm
bash scripts/docker-up.sh --without-llm
```

직접 실행하고 싶다면:

```bash
# 앱만
docker compose up --build

# 앱 + Ollama + qwen3.5:4b
docker compose -f docker-compose.yml -f docker-compose.llm.yml up --build
```

LLM bundle을 포함해도 model pull이 늦거나 실패하면 앱 스택은 그대로 올라오고, LLM 관련 단계만 pass된다.

기본 주소:

- frontend: `http://127.0.0.1:3000`
- backend health: `http://127.0.0.1:8787/api/health`
- redis: `127.0.0.1:6380`
- ollama tags: `http://127.0.0.1:11434/api/tags` (LLM bundle 포함 시)

Redis host port를 더 바꾸고 싶으면 `SPARKORBIT_REDIS_HOST_PORT`, Ollama host port를 바꾸고 싶으면 `SPARKORBIT_OLLAMA_HOST_PORT` 환경변수로 override할 수 있다.

최소 확인:

```bash
curl http://127.0.0.1:8787/api/health
```

LLM bundle을 포함했다면:

```bash
curl http://127.0.0.1:11434/api/tags
```

브라우저에서 frontend를 열면 active session이 없을 경우 homepage bootstrap이 자동 시작된다. 진행 단계와 fullscreen loading 규칙은 [06. UI Design Guide](./06_ui_design_guide.md), backend session flow는 [03. Runtime Flow](./03_runtime_flow_draft.md)를 따른다.

## 5. Company Filter Run

현재 canonical prompt pack:

- `docs/prompt_packs/company_filter_v2.md`

가장 최근 run에 대해 실행:

```bash
python scripts/llm_enrich.py
```

특정 run에 대해 실행:

```bash
python scripts/llm_enrich.py --run-dir ../source_fetch/data/runs/<run_id>
```

limited run:

```bash
python scripts/llm_enrich.py --limit 12 --chunk-size 6 --max-age-days 90
```

현재 구현 범위:

- 입력: `company`, `company_kr`, `company_cn`, `hf_blog`
- recency: `published_at/sort_at` 기준 최근 `90일` 기본
- source별 최대: `5건` 기본 (`--per-source`로 조절)
- 553건 → 63건 (15개 소스 × 최대 5건, github_* 제외)으로 줄어든 뒤 LLM에 들어감
- 출력: `labels/company_decisions.ndjson`
- task: `keep / drop / needs_review` + `company_domain`

## 5-b. Paper Domain Run

canonical prompt pack:

- `docs/prompt_packs/paper_domain_v1.md`

가장 최근 run에 대해 실행:

```bash
python scripts/paper_enrich.py
```

특정 run에 대해 실행:

```bash
python scripts/paper_enrich.py --run-dir ../source_fetch/data/runs/<run_id>
```

현재 구현 범위:

- 입력: `arxiv_rss_cs_*`, `arxiv_rss_stat_ml`, `hf_daily_papers`
- recency 필터: 없음 (RSS 피드 자체가 최신)
- 출력: `labels/paper_domains.ndjson`
- task: 22개 연구 domain 중 하나로 분류
- default chunk_size: `100` (title-only라 큼)

## 6. Outputs

```text
pipelines/source_fetch/data/runs/<run_id>/
  normalized/
    documents.ndjson          ← 수집 + 정규화된 전체 문서
    metrics.ndjson            ← 수집 통계
    contract_report.json      ← 필드 커버리지 리포트
  labels/
    company_decisions.ndjson  ← company panel keep/drop + domain
    paper_domains.ndjson      ← paper panel domain 분류
    review_queue.ndjson       ← needs_review 항목 모음
    llm_runs.ndjson           ← 실행 로그 (company_filter, paper_domain 모두 여기에 append)
```

## 7. Verification

최소 확인 순서:

1. `curl http://localhost:11434/api/tags` 에서 `qwen3.5:4b`가 보여야 한다.
2. `python scripts/llm_enrich.py --limit 12 --chunk-size 6` 이 종료되어야 한다.
3. `labels/company_decisions.ndjson` 가 생성되어야 한다.
4. `python scripts/paper_enrich.py` 가 종료되어야 한다.
5. `labels/paper_domains.ndjson` 가 생성되어야 한다.
6. `labels/llm_runs.ndjson` 에 `company_filter`와 `paper_domain` 두 phase 로그가 남아야 한다.

## 8. Change Discipline

운영 절차를 바꿀 때는 아래를 같이 본다.

1. 이 문서를 먼저 수정한다.
2. 필요하면 `pipelines/source_fetch/README.md`, `pipelines/llm_enrich/README.md`, root `README.md` 를 같이 맞춘다.
3. target design 변경이면 `04` 또는 `03`도 같이 수정한다.

즉, 코드보다 문서가 먼저가 아니라도 되지만, **머지 시점에는 문서와 절차가 항상 일치해야 한다.**
