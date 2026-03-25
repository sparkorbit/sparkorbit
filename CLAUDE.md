# SparkOrbit - Working Notes

## 프로젝트 방향

AI/Tech 정보를 한 화면에서 탐색하는 `Open World Agents` 기반 world monitor 프로젝트다.

## 먼저 읽을 문서

1. `docs/01_overall_flow.md`
2. `docs/02_sections/02_1_sources.md`
3. `docs/02_sections/02_2_fields.md`
4. `docs/03_runtime_flow_draft.md`
5. `docs/05_data_collection_pipeline.md`
6. `docs/06_ui_design_guide.md`
7. `docs/04_llm_usage.md`

## 현재 구현된 코드 범위

### 데이터 수집
- `pipelines/source_fetch/scripts/data_collection.py` — 단일 CLI entrypoint
- `pipelines/source_fetch/scripts/source_fetch/adapters.py` — source별 fetch/parse
- `pipelines/source_fetch/scripts/source_fetch/models.py` — dataclass
- `pipelines/source_fetch/scripts/source_fetch/pipeline.py` — orchestration

### 백엔드 런타임
- `backend/app/main.py` — FastAPI app entrypoint
- `backend/app/api/routes/dashboard.py` — dashboard, digest, document, SSE
- `backend/app/api/routes/sessions.py` — reload state, reload stream
- `backend/app/api/routes/leaderboards.py` — leaderboard overview
- `backend/app/services/session_service.py` — bootstrap, reload, publish, digest
- `backend/app/services/collector.py` — `pipelines/source_fetch` wrapper
- `backend/app/services/summary_provider.py` — summary provider abstraction

### 프론트엔드
- `src/App.tsx` — dashboard, fullscreen loading, reload recovery, settings
- `src/components/dashboard/PanelWorkspace.tsx` — workspace layout
- `src/components/dashboard/SourcePanel.tsx` — source feed panel
- `src/components/dashboard/SummaryPanel.tsx` — category digest panel
- `src/lib/dashboardApi.ts` — BFF API client + SSE hooks
- `src/index.css` — visual tokens, loader, reveal motion

### LLM Enrichment
- `pipelines/llm_enrich/scripts/llm_enrich.py` — Company filter
- `pipelines/llm_enrich/scripts/paper_enrich.py` — Paper domain classifier
- `docs/prompt_packs/` — prompt pack 문서 (코드와 1:1 대응)

### 런타임 레이어 정리

- canonical artifact는 항상 `pipelines/source_fetch/data/runs/<run_id>/` 아래 run output이다.
- Redis는 장기 저장소가 아니라 현재 세션을 빠르게 서빙하기 위한 materialized layer다.
- frontend는 JSONL run output를 직접 읽지 않고 backend API/BFF만 사용한다.
- homepage bootstrap과 manual reload는 현재 backend가 실제 collection부터 publish, digest까지 연결한다.
- `pipelines/llm_enrich`는 별도 오프라인 LLM labeling tooling이고, homepage summary lane은 backend session runtime이 만든다.

### 출력 경로

```text
pipelines/source_fetch/data/runs/<run_id>/
  normalized/
    documents.ndjson         ← 수집 원본 (전체 문서)
  labels/
    company_decisions.ndjson ← Company filter 결과
    paper_domains.ndjson     ← Paper domain 결과
    review_queue.ndjson      ← needs_review 항목
    llm_runs.ndjson          ← 실행 로그 (append)
```

## 핵심 원칙

1. 설치 즉시 동작
2. 무료만 사용
3. 인증 없는 소스 우선
4. 과하게 만들지 않기

## 패널 구조

| 패널 | 현재 주체 | 소스 |
|------|-----------|------|
| Papers | runtime digest + source feed | arXiv 8개 + HF daily papers |
| Models | runtime digest + source feed | HF models likes/new/trending |
| Company | filter + source feed | 기업 블로그 + hf_blog (github_* 제외) |
| Community | source feed | HN, Reddit, github_curated_repos |
| Benchmark | leaderboard + source feed | LMArena, Open LLM Leaderboard |
| Summary | category digest | 위 패널 종합 |

## LLM 출력 형식 (코드가 반드시 따를 것)

### Company Filter → `labels/company_decisions.ndjson`

```json
{
  "document_id": "openai_news_rss:gpt5-turbo",
  "filter_scope": "company_panel",
  "decision": "keep",
  "company_domain": "model_release",
  "reason_code": "model_signal",
  "model_name": "qwen3.5:4b",
  "runtime": "ollama",
  "prompt_version": "company_filter_v2",
  "schema_version": "document_filter_v2",
  "generated_at": "2026-03-24T09:44:14Z"
}
```

`decision` enum: `keep | drop | needs_review`

`company_domain` enum (drop이면 null):
`model_release | product_update | technical_research | open_source | benchmark_eval | partnership_ecosystem | policy_safety | others`

`reason_code` enum:
`model_signal | product_signal | research_signal | oss_signal | benchmark_signal | partnership_signal | policy_signal | other_signal | event_or_program | recruiting_or_pr | general_promo | unclear_scope | runtime_fallback`

### Paper Domain → `labels/paper_domains.ndjson`

```json
{
  "document_id": "arxiv_rss_cs_ai:2603.19429",
  "filter_scope": "paper_panel",
  "paper_domain": "agents",
  "model_name": "qwen3.5:4b",
  "runtime": "ollama",
  "prompt_version": "paper_domain_v1",
  "schema_version": "paper_domain_v1",
  "generated_at": "2026-03-24T10:00:00Z"
}
```

`paper_domain` enum:
`llm | vlm | diffusion | agents | reasoning | rlhf_alignment | safety | rag_retrieval | efficient_inference | finetuning | evaluation | nlp | speech_audio | robotics_embodied | video | 3d_spatial | graph_structured | continual_learning | federated_privacy | medical_bio | science | others`

### LLM 입력 형식

Company: `{"id": "...", "src": "...", "title": "...", "desc": "앞 200자 (있을 때만)"}`
Paper: `{"id": "...", "title": "..."}`

프론트엔드는 `document_id`로 `documents.ndjson` 원본을 join해서 메타데이터를 렌더링한다. LLM이 날짜, URL, engagement, ordering을 다시 만들지 않는다.

## LLM 파이프라인 기준값

| 항목 | Company | Paper |
|------|---------|-------|
| 모델 | qwen3.5:4b | qwen3.5:4b |
| runtime | Ollama | Ollama |
| num_ctx | 131072 | 131072 |
| pre-LLM 필터 | 90일, source당 5건, github_* 제외 | 없음 (RSS 자체가 최신) |
| 입력 건수 | 68건 (16개 소스) | 180건 (9개 소스) |
| chunk_size | 30 | 100 |
| 소요 시간 | ~46초 | ~185초 |

## 작업 시 주의사항

- source별 adapter는 독립적으로 유지한다.
- HTTP 에러나 파싱 실패는 skip하고 다음 source로 넘어간다.
- 날짜는 수집 시점에 ISO 8601(UTC)로 변환한다.
- URL 없는 문서는 기본 서빙 대상에서 제외한다.
- normalized contract는 shape를 유지한다. 값이 없으면 `null`, `[]`, `{}`를 쓴다.
- 문서(`docs/`)와 코드(`pipelines/`, `backend/app`, `src`)의 수치, enum, 필드명, loading stage가 어긋나지 않도록 한다. 변경 시 함께 업데이트한다.
