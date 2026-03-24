# Source Fetch

37개 AI/Tech source에서 데이터를 수집하는 collection pipeline PoC.
Redis 없이 raw → normalized JSONL로 저장한다.

## Setup

```bash
cd PoC/source_fetch
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
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

## Files

| File | Role |
|------|------|
| `scripts/data_collection.py` | CLI entrypoint |
| `scripts/source_fetch/adapters.py` | source별 fetch/parse |
| `scripts/source_fetch/models.py` | SourceConfig, FetchResult dataclass |
| `scripts/source_fetch/pipeline.py` | orchestration, contract normalize, discovery/ranking |
