[Index](./README.md) · [01. Overall Flow](./01_overall_flow.md) · [02. Sections](./02_sections/README.md) · [02.1 Sources](./02_sections/02_1_sources.md) · [02.2 Fields](./02_sections/02_2_fields.md) · [03. Runtime Flow](./03_runtime_flow_draft.md) · [04. LLM Usage](./04_llm_usage.md) · **05. Data Collection Pipeline** · [06. UI Design Guide](./06_ui_design_guide.md)

---

# SparkOrbit Docs - 05. Data Collection Pipeline

> Implemented pipeline
> 이 문서는 현재 저장소에 실제로 구현된 `pipelines/source_fetch` collection pipeline을 설명한다.

## Scope

이 파이프라인은 Redis 없이 source에서 데이터를 직접 가져와서 아래 산출물을 만든다.

- `raw_responses/`
- `raw_items/`
- `normalized/documents.ndjson`
- `normalized/metrics.ndjson`
- `normalized/contract_report.json`
- `logs/`

실행 시 source별 총 소요 시간과 HTTP request 단위 timing도 함께 기록한다. 따라서 느린 source가 "네트워크 때문인지", "파싱 때문인지"를 run output만으로 다시 확인할 수 있다.

## Public Entrypoint

- `pipelines/source_fetch/scripts/data_collection.py`

이 파일이 공식 CLI entrypoint다.
limit, sources, output_dir, timeout을 받아 `run_collection(...)`을 호출한다.
기본 동작은 source별 기본 limit를 사용한다. 일반 source는 `20개`, paper 계열 고밀도 source는 `24~30개`, `hn_topstories` 같은 저밀도 source는 더 낮게 가져온다. `--limit`을 주면 모든 source에 동일한 override가 적용된다.

## Code Layout

| 파일 | 역할 |
|------|------|
| `pipelines/source_fetch/scripts/data_collection.py` | 단일 CLI entrypoint |
| `pipelines/source_fetch/scripts/source_fetch/adapters.py` | source registry + per-source fetch / parse |
| `pipelines/source_fetch/scripts/source_fetch/models.py` | `SourceConfig`, `FetchResult`, `RawResponse` dataclass |
| `pipelines/source_fetch/scripts/source_fetch/pipeline.py` | orchestration, normalize, filter, ranking, report |

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
  -> write manifests + contract report
```

## Output Structure

```text
pipelines/source_fetch/data/runs/<run_id>/
  run_manifest.json               ← 실행 메타 (run_id, 시작 시간 등)
  source_manifest.ndjson           ← source별 수집 결과 요약
  raw_responses/                   ← source별 HTTP 응답 원본
  raw_items/                       ← source별 파싱된 원본 item
  normalized/
    documents.ndjson               ← 정규화된 전체 문서 (이후 파이프라인의 입력)
    metrics.ndjson                 ← 수집 통계
    contract_report.json           ← 필드 커버리지 리포트
  labels/                          ← LLM 판정/분류 결과 (llm_enrich가 생성)
    company_decisions.ndjson       ← company panel keep/drop + domain
    paper_domains.ndjson           ← paper panel domain 분류
    review_queue.ndjson            ← needs_review 항목 모음
    llm_runs.ndjson                ← LLM 실행 로그
    session_document_summaries.ndjson ← session runtime 문서 summary snapshot (후속 단계 생성)
    session_category_digests.ndjson   ← session runtime category digest snapshot (후속 단계 생성)
    session_briefings.ndjson          ← session runtime briefing snapshot (후속 단계 생성)
  logs/                            ← 수집 로그
    fetch.ndjson                   ← source별 fetch/normalize/filter/persist timing 요약
    requests.ndjson                ← HTTP request 단위 timing 로그
```

## Contract Notes

- `documents.ndjson`는 source마다 정보량이 달라도 가능한 한 같은 shape를 유지한다.
- `discovery`는 새로움/반짝임을 설명한다.
- `ranking`은 live monitor 화면 정렬용 점수와 bucket을 제공한다.
- `reference_url`, `canonical_url`, `url`이 모두 비어 있는 문서는 기본 서빙 대상에서 제외한다.
- `source_manifest.ndjson` 각 row에는 `duration_ms`, `fetch_duration_ms`, `request_count`, `slowest_request_name` 같은 timing summary가 들어간다.
- `lmarena_overview`는 overview page에서 board link를 찾은 뒤, board별 dedicated page도 추가로 읽어서 전체 leaderboard row를 구조화한다.
- `raw_responses/`, `raw_items/`, `normalized/`, `labels/`는 run별 canonical artifact다. 이후 demo, export, UI 표시를 위해 내용을 덮어쓰거나 손으로 고치지 않는다.
- 잘못된 결과를 고치고 싶으면 기존 run artifact를 patch하지 말고, source/parser/rule/prompt를 수정한 뒤 새 run 또는 새 label output을 생성한다.
- `labels/`는 오프라인 enrichment 전용 디렉토리가 아니라, 이후 session runtime이 생성한 summary/briefing snapshot까지 포함하는 LLM/runtime artifact 공간으로 취급한다.

## Run Examples

default full run:

```bash
cd pipelines/source_fetch
. .venv/bin/activate
python scripts/data_collection.py --run-label full
```

wide run with higher cap:

```bash
cd pipelines/source_fetch
. .venv/bin/activate
python scripts/data_collection.py --limit 30 --run-label max
```

## Current Known Constraints

- GitHub는 unauthenticated rate limit의 영향을 받는다.
- 일부 source는 feed 구조상 10개 안팎만 제공한다.
- URL이 없는 source item은 normalized 문서에서 제외된다.
- `data/runs/*`는 실행 산출물이지 source code가 아니다.

## Relationship To Other Docs

- source 선정 자체는 [02.1 Sources](./02_sections/02_1_sources.md)에서 관리한다.
- normalized field contract는 [02.2 Fields](./02_sections/02_2_fields.md)에서 본다.
- Redis session publish, dashboard serving, frontend SSE 흐름은 [03. Runtime Flow](./03_runtime_flow_draft.md)에서 본다.
- LLM 판정/분류 (company filter, paper domain 등)는 [04. LLM Usage](./04_llm_usage.md)에서 본다.
- 현재 프론트엔드 시각, 로딩, workspace 규칙은 [06. UI Design Guide](./06_ui_design_guide.md)에서 본다.
- 실제 setup/run/verification 절차는 [06. Operational Playbook](./06_operational_playbook.md)에서 본다.
