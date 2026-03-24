[Index](./README.md) · [01. Overall Flow](./01_overall_flow.md) · [02. Sections](./02_sections/README.md) · [02.1 Sources](./02_sections/02_1_sources.md) · [02.2 Fields](./02_sections/02_2_fields.md) · [03. Runtime Flow](./03_runtime_flow_draft.md) · [04. LLM Usage](./04_llm_usage.md) · **05. Data Collection Pipeline** · [06. UI Design Guide](./06_ui_design_guide.md)

---

# SparkOrbit Docs - 05. Data Collection Pipeline

> Implemented PoC collection pipeline
> Last updated: 2026-03-24

## Scope

이 문서는 현재 저장소의 canonical collection layer인 `PoC/source_fetch`를 설명한다.

이 파이프라인 자체는 Redis나 FastAPI를 직접 다루지 않는다. 대신 아래 산출물을 만들어 두고, backend runtime이 이 run output를 읽어 Redis session을 만든다.

## Public Entrypoint

- `PoC/source_fetch/scripts/data_collection.py`

공식 CLI entrypoint는 이 파일 하나다. `profile`, `limit`, `sources`, `output_dir`, `timeout`, `run_label`을 받아 `run_collection(...)`을 호출한다.

## Code Layout

| File | Role |
|------|------|
| `PoC/source_fetch/scripts/data_collection.py` | 단일 CLI entrypoint |
| `PoC/source_fetch/scripts/source_fetch/adapters.py` | source registry + per-source fetch/parse |
| `PoC/source_fetch/scripts/source_fetch/models.py` | `SourceConfig`, `FetchResult`, `RawResponse` dataclass |
| `PoC/source_fetch/scripts/source_fetch/pipeline.py` | orchestration, normalize, filter, ranking, reports, progress callback |

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

## Implemented Flow

```text
data_collection.py
  -> resolve selected sources
  -> fetch_source(...) for each source
  -> write raw_responses + raw_items
  -> normalize document / metric contract
  -> compute discovery + ranking during normalization
  -> filter out URL-less documents
  -> write documents.ndjson + metrics.ndjson
  -> write sample preview + manifests + contract report
  -> emit progress events when requested
```

## Progress Callback

`run_collection(...)`은 optional `progress_callback`을 받을 수 있다.

현재 backend runtime은 이 callback을 사용해서 아래 stage를 실시간으로 frontend에 전달한다.

- `starting`
- `fetching_sources`
- `writing_artifacts`

즉 collection layer는 여전히 독립적이지만, runtime이 필요할 때 live progress를 관찰할 수 있게 되어 있다.

## Contract Notes

- `documents.ndjson`는 source마다 정보량이 달라도 가능한 한 같은 shape를 유지한다.
- `discovery`는 새로움/반짝임을 설명한다.
- `ranking`은 live monitor 화면 정렬용 점수와 bucket을 제공한다.
- `reference_url`, `canonical_url`, `url`이 모두 비어 있는 문서는 기본 서빙 대상에서 제외한다.
- `samples/`는 source preview artifact이며, 현재 frontend의 실제 데이터 source는 아니다.

## Why `samples/` Still Exists

collection은 source별 결과를 빠르게 점검하기 위해 `samples/{source}.sample.json`도 만든다.

이 파일은:

- source별 preview/debug 용도이고
- run artifact 일부로 `source_manifest.sample_path`에 기록될 수 있으며
- frontend mock fixture를 의미하지 않는다

## Relationship To Backend Runtime

backend는 collection 코드를 복제하지 않고 wrapper만 둔다.

```text
backend/app/services/collector.py
  -> import PoC/source_fetch/scripts/source_fetch/pipeline.py
  -> run_collection(...)
  -> receive run_dir
  -> publish_run(...) into Redis
```

즉 collection과 serving/runtime은 분리돼 있지만, run output를 경계로 이어진다.

## Run Examples

### Default full run

```bash
cd PoC/source_fetch
. .venv/bin/activate
python scripts/data_collection.py --run-label full
```

### Sample run

```bash
cd PoC/source_fetch
. .venv/bin/activate
python scripts/data_collection.py --profile sample --run-label sample
```

### Wider run

```bash
cd PoC/source_fetch
. .venv/bin/activate
python scripts/data_collection.py --profile full --limit 30 --run-label max
```

## Current Known Constraints

- GitHub는 unauthenticated rate limit 영향을 받는다.
- 일부 source는 feed 구조상 아이템 수가 적다.
- URL 없는 source item은 normalized 문서에서 제외된다.
- `data/runs/*`는 실행 산출물이지 source code가 아니다.

## Relationship To Other Docs

- source 선정 자체는 [02.1 Sources](./02_sections/02_1_sources.md)에서 관리한다.
- normalized field contract는 [02.2 Fields](./02_sections/02_2_fields.md)에서 본다.
- backend/Redis/frontend serving 흐름은 [03. Runtime Flow](./03_runtime_flow_draft.md)에서 본다.
- 현재 화면과 로딩 UX 규칙은 [06. UI Design Guide](./06_ui_design_guide.md)에서 본다.
