[Index](./README.md) · [01. Overall Flow](./01_overall_flow.md) · [02. Sections](./02_sections/README.md) · [03. Runtime Flow Draft](./03_runtime_flow_draft.md) · [04. LLM Usage](./04_llm_usage.md) · [05. Data Collection Pipeline](./05_data_collection_pipeline.md) · **06. Operational Playbook**

---

# SparkOrbit - 06. Operational Playbook

> Canonical runbook for setup and execution
> Last updated: 2026-03-24

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

현재 실제로 usable 하게 맞춘 절차는 아래 세 단계다.

1. `PoC/source_fetch` 데이터 수집
2. `PoC/llm_enrich` 에서 `Ollama + qwen3.5:4b` 기반 company filter enrichment
3. `PoC/llm_enrich` 에서 `Ollama + qwen3.5:4b` 기반 paper domain classification

아직 이 문서에 없는 절차는 공식 운영 절차로 간주하지 않는다.

## 2. Environment Setup

Collection 작업 루트:

```bash
cd /data/jjunsss/hackerton/documents-planning/PoC/source_fetch
```

Python 환경:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock.txt
```

## 3. Collection Run

샘플 실행:

```bash
python scripts/data_collection.py --profile sample --run-label sample
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
  samples/
  logs/
```

LLM enrichment 작업 루트:

```bash
cd /data/jjunsss/hackerton/documents-planning/PoC/llm_enrich
```

Python 환경:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock.txt
```

## 4. Local LLM Setup

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

## 5. Enrichment Run — Company Filter

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

smoke test:

```bash
python scripts/llm_enrich.py --limit 12 --chunk-size 6 --sample-mode round_robin_source --max-age-days 90
```

현재 구현 범위:

- 입력: `company`, `company_kr`, `company_cn`, `hf_blog`
- recency: `published_at/sort_at` 기준 최근 `90일` 기본
- source별 최대: `5건` 기본 (`--per-source`로 조절)
- 553건 → 63건 (15개 소스 × 최대 5건, github_* 제외)으로 줄어든 뒤 LLM에 들어감
- 출력: `enriched/document_filters.ndjson`
- task: `keep / drop / needs_review` + `company_domain`

## 5-b. Enrichment Run — Paper Domain

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

dry run (후보만 확인):

```bash
python scripts/paper_enrich.py --dry-run
```

현재 구현 범위:

- 입력: `arxiv_rss_cs_*`, `arxiv_rss_stat_ml`, `hf_daily_papers`
- recency 필터: 없음 (RSS 피드 자체가 최신)
- 출력: `enriched/paper_domains.ndjson`
- task: 22개 연구 domain 중 하나로 분류
- default chunk_size: `100` (title-only라 큼)

## 6. Outputs

```text
PoC/source_fetch/data/runs/<run_id>/
  normalized/
    documents.ndjson          ← 수집 + 정규화된 전체 문서
    metrics.ndjson            ← 수집 통계
    contract_report.json      ← 필드 커버리지 리포트
  enriched/
    document_filters.ndjson   ← company panel keep/drop + domain
    paper_domains.ndjson      ← paper panel domain 분류
    failed_items.ndjson       ← needs_review 항목 모음
    llm_runs.ndjson           ← 실행 로그 (company_filter, paper_domain 모두 여기에 append)
```

## 7. Verification

최소 확인 순서:

1. `curl http://localhost:11434/api/tags` 에서 `qwen3.5:4b`가 보여야 한다.
2. `python scripts/llm_enrich.py --limit 12 --chunk-size 6` 이 종료되어야 한다.
3. `enriched/document_filters.ndjson` 가 생성되어야 한다.
4. `python scripts/paper_enrich.py --dry-run` 이 후보 수를 출력해야 한다.
5. `python scripts/paper_enrich.py` 가 종료되어야 한다.
6. `enriched/paper_domains.ndjson` 가 생성되어야 한다.
7. `enriched/llm_runs.ndjson` 에 `company_filter`와 `paper_domain` 두 phase 로그가 남아야 한다.

## 8. Change Discipline

운영 절차를 바꿀 때는 아래를 같이 본다.

1. 이 문서를 먼저 수정한다.
2. 필요하면 `PoC/source_fetch/README.md`, `PoC/llm_enrich/README.md`, root `README.md` 를 같이 맞춘다.
3. target design 변경이면 `04` 또는 `03`도 같이 수정한다.

즉, 코드보다 문서가 먼저가 아니라도 되지만, **머지 시점에는 문서와 절차가 항상 일치해야 한다.**
