# Source Fetch

37개 AI/Tech source에서 데이터를 수집하는 collection pipeline.
Redis 없이 `raw -> normalized` 파일로 저장한다.
후속 LLM enrichment 코드는 [pipelines/llm_enrich](../llm_enrich/) 에서 따로 관리한다.
실제 setup / run / verification 절차의 canonical 문서는 [docs/06_operational_playbook.md](../../docs/06_operational_playbook.md) 이고, 이 README는 collection quick reference로 유지한다.

## Setup

```bash
cd pipelines/source_fetch
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock.txt
```

## Run

```bash
# sample (source당 3건)
python scripts/data_collection.py --profile sample --run-label sample

# full (source당 20건)
python scripts/data_collection.py --run-label full

# 특정 source만
python scripts/data_collection.py --sources hf_daily_papers hn_topstories --limit 2 --run-label quick
```

## Handoff To LLM Pipeline

수집이 끝나면 `pipelines/llm_enrich` 가 이 run output을 읽어 후속 enrichment를 수행한다.

즉 경계는 아래와 같다.

- `source_fetch`: collect + normalize
- `llm_enrich`: enrich + filter

## Output

```
data/runs/<run_id>/
  run_manifest.json
  source_manifest.ndjson
  raw_responses/        ← API 원본 통째
  raw_items/            ← 아이템별 원본 payload
  normalized/
    documents.ndjson    ← 정규화 문서
    metrics.ndjson
    contract_report.json
  samples/
  logs/
```

`enriched/` 아래 결과는 `pipelines/llm_enrich` 실행 후 같은 run 디렉터리에 추가된다.

## Files

| File | Role |
|------|------|
| `scripts/data_collection.py` | CLI entrypoint |
| `scripts/source_fetch/adapters.py` | source별 fetch/parse |
| `scripts/source_fetch/models.py` | SourceConfig, FetchResult dataclass |
| `scripts/source_fetch/pipeline.py` | orchestration, contract normalize, discovery/ranking |
