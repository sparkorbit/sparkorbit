[Index](./README.md) · [01. Overall Flow](./01_overall_flow.md) · [02. Sections](./02_sections/README.md) · [02.1 Sources](./02_sections/02_1_sources.md) · [02.2 Fields](./02_sections/02_2_fields.md) · [03. Runtime Flow Draft](./03_runtime_flow_draft.md) · [04. LLM Usage](./04_llm_usage.md) · **05. Data Collection Pipeline**

---

# SparkOrbit Docs - 05. Data Collection Pipeline

> Implemented PoC
> 이 문서는 현재 저장소에 실제로 구현된 `PoC/source_fetch` collection pipeline을 설명한다.

## Scope

이 파이프라인은 Redis 없이 source에서 데이터를 직접 가져와서 아래 산출물을 만든다.

- `raw_responses/`
- `raw_items/`
- `normalized/documents.ndjson`
- `normalized/metrics.ndjson`
- `normalized/contract_report.json`
- `samples/`
- `logs/`

## Public Entrypoint

- `PoC/source_fetch/scripts/data_collection.py`

이 파일이 공식 CLI entrypoint다.
profile, limit, sources, output_dir, timeout을 받아 `run_collection(...)`을 호출한다.
실행에 필요한 `PROFILE_LIMITS`, `run_collection`은 같은 저장소의 `source_fetch/pipeline.py`에 있으므로, entrypoint와 pipeline 파일이 함께 commit / push되어 있어야 한다.
현재 기본 `full` profile은 source당 최대 `20개`를 가져오도록 맞춘다.

## Code Layout

| 파일 | 역할 |
|------|------|
| `PoC/source_fetch/scripts/data_collection.py` | 단일 CLI entrypoint |
| `PoC/source_fetch/scripts/source_fetch/adapters.py` | source registry + per-source fetch / parse |
| `PoC/source_fetch/scripts/source_fetch/models.py` | `SourceConfig`, `FetchResult`, `RawResponse` dataclass |
| `PoC/source_fetch/scripts/source_fetch/pipeline.py` | orchestration, normalize, filter, ranking, report |

## Implemented Flow

```text
data_collection.py
  -> resolve selected sources
  -> fetch_source(...) for each source
  -> write raw_responses + raw_items
  -> normalize document / metric contract
  -> compute discovery + ranking during document normalization
  -> filter out URL-less documents
  -> write documents.ndjson + metrics.ndjson
  -> write sample preview + manifests + contract report
```

## Output Structure

```text
PoC/source_fetch/data/runs/<run_id>/
  run_manifest.json
  source_manifest.ndjson
  raw_responses/
  raw_items/
  normalized/
    documents.ndjson
    metrics.ndjson
    contract_report.json
  samples/
  logs/
```

## Contract Notes

- `documents.ndjson`는 source마다 정보량이 달라도 가능한 한 같은 shape를 유지한다.
- `discovery`는 새로움/반짝임을 설명한다.
- `ranking`은 live monitor 화면 정렬용 점수와 bucket을 제공한다.
- `reference_url`, `canonical_url`, `url`이 모두 비어 있는 문서는 기본 서빙 대상에서 제외한다.

## Run Examples

설치 확인이나 onboarding 용도로는 `sample` run을 먼저 보는 편이 더 안전하다.

default full run:

```bash
cd PoC/source_fetch
. .venv/bin/activate
python scripts/data_collection.py --run-label full
```

sample run:

```bash
cd PoC/source_fetch
. .venv/bin/activate
python scripts/data_collection.py --profile sample --run-label sample
```

wide run with higher cap:

```bash
cd PoC/source_fetch
. .venv/bin/activate
python scripts/data_collection.py --profile full --limit 30 --run-label max
```

## Current Known Constraints

- GitHub는 unauthenticated rate limit의 영향을 받는다.
- 일부 source는 feed 구조상 10개 안팎만 제공한다.
- URL이 없는 source item은 normalized 문서에서 제외된다.
- `data/runs/*`는 실행 산출물이지 source code가 아니다.

## Relationship To Other Docs

- source 선정 자체는 [02.1 Sources](./02_sections/02_1_sources.md)에서 관리한다.
- normalized field contract는 [02.2 Fields](./02_sections/02_2_fields.md)에서 본다.
- Redis/UI를 포함한 목표 구조는 [03. Runtime Flow Draft](./03_runtime_flow_draft.md)에서 본다.
- LLM 요약/cluster/digest 활용은 [04. LLM Usage](./04_llm_usage.md)에서 본다.
