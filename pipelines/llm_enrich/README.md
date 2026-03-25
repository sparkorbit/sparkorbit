# LLM Labels

`pipelines/source_fetch` 가 만든 normalized run output을 읽어, local LLM 기반 판정/분류를 수행하는 pipeline.
현재 범위는 `Company / Release` panel용 filtering과 `company_domain` 분류다.
실제 setup / run / verification 절차의 canonical 문서는 [docs/06_operational_playbook.md](../../docs/06_operational_playbook.md) 이고, 이 README는 LLM pipeline quick reference로 유지한다.

## Setup

```bash
cd pipelines/llm_enrich
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock.txt
```

## Local LLM Setup

기본 실험 런타임은 `Ollama + qwen3.5:4b` 이다.

### Docker

전체 앱 스택을 쓸 때는 저장소 루트 `bash scripts/docker-up.sh` 가 local LLM bundle 포함 여부를 묻고, 포함 시 Ollama와 `qwen3.5:4b` 준비까지 함께 처리한다. 여기 절차는 `llm_enrich` 만 단독으로 돌릴 때의 standalone setup이다.

```bash
cd pipelines/llm_enrich
bash scripts/setup_ollama_docker.sh
```

직접 띄우고 싶다면:

```bash
docker compose -f docker-compose.ollama.yml up -d
docker exec sparkorbit-ollama ollama pull qwen3.5:4b
```

API 확인:

```bash
curl http://localhost:11434/api/tags
```

## Run

```bash
# 가장 최근 source_fetch run에 대해 실행
python scripts/llm_enrich.py

# 특정 source_fetch run에 대해 실행
python scripts/llm_enrich.py --run-dir ../source_fetch/data/runs/<run_id>

# smoke test
python scripts/llm_enrich.py --limit 12 --chunk-size 6 --sample-mode round_robin_source
```

## Defaults

- runtime: `Ollama`
- model: `qwen3.5:4b`
- mode: `text-only`
- thinking: `off`
- sampling baseline: `temperature=0.7`, `top_p=0.8`, `top_k=20`, `min_p=0.0`, `repeat_penalty=1.0`
- canonical prompt pack: `docs/prompt_packs/company_filter_v2.md`
- source run root: `../source_fetch/data/runs`
- output target: source run의 `labels/`

## Input / Output

입력:

```text
pipelines/source_fetch/data/runs/<run_id>/
  normalized/
    documents.ndjson
    metrics.ndjson
```

출력:

```text
pipelines/source_fetch/data/runs/<run_id>/
  labels/
    company_decisions.ndjson
    review_queue.ndjson
    llm_runs.ndjson
```

## Files

| File | Role |
|------|------|
| `scripts/llm_enrich.py` | local Ollama 기반 company filter 판정 |
| `scripts/setup_ollama_docker.sh` | Ollama Docker + model pull setup |
| `docker-compose.ollama.yml` | local Ollama runtime for Docker |
| `requirements.txt` | minimal runtime dependency spec |
| `requirements.lock.txt` | quick install baseline for local env |
