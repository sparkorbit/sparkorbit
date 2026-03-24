[Index](./README.md) · [01. Overall Flow](./01_overall_flow.md) · [02. Sections](./02_sections/README.md) · [02.1 Sources](./02_sections/02_1_sources.md) · **03. Runtime Flow Draft** · [04. LLM Usage](./04_llm_usage.md) · [05. Data Collection Pipeline](./05_data_collection_pipeline.md)

---

# SparkOrbit Docs - 03. Runtime Flow Draft

> Review draft
> 이 문서는 Redis/UI를 포함한 target architecture 초안이다.

> Note
> 현재 구현된 collection 코드는 이 문서가 아니라 [05. Data Collection Pipeline](./05_data_collection_pipeline.md)에 정리한다.

## Why This File Exists

기존 research 문서의 `Section 3+`는 source 조사라기보다 **runtime/storage/serving 계획**에 가까웠다.
사용자 기준으로도 이 부분은 아직 flow 확인용 초안 성격이 있으므로, canonical source 문서와 분리해 별도 draft로 둔다.

## Current Assumptions

1. 앱 시작 시 source를 한 번 읽어와 화면을 채운다.
2. `Clear` 또는 날짜 변경 시 같은 실행 환경 안에서 다시 로딩한다.
3. source feed는 분리 보관한다.
4. summary / cluster / digest 단계에서만 cross-source 묶음을 만든다.
5. Redis는 장기 보관 DB보다 세션 상태 저장소에 가깝다.
6. 크롤링 결과의 HTML entity, 특수문자 깨짐, 공백 이상치는 항상 발생할 수 있다고 본다.

## Proposed Runtime Shape

```text
Source Adapters
  -> raw/doc store
  -> company panel filter
  -> summary / cluster / digest
  -> Open World Agents UI
```

## Session Model

- `session_id` 또는 `session_date` 기준으로 현재 세션을 구분한다.
- 세션이 바뀌면 기존 데이터를 비우거나 무시하고 다시 수집한다.
- Docker를 다시 설치하거나 전체 재배포하는 개념이 아니라, 같은 환경에서 데이터 로딩만 다시 도는 쪽이 맞다.

## Draft Storage Layers

| Layer | Role |
|------|------|
| **raw** | source 원본 payload 보존 |
| **doc** | 화면과 LLM이 읽을 공통 문서. entity decode, 공백 정리 등 최소 정규화 수행 |
| **filter** | panel별 keep/drop 판정. 특히 company panel 적합 여부 저장 |
| **summary** | source별 문서 요약 |
| **cluster** | 여러 source를 주제 단위로 묶은 event |
| **digest** | 홈 화면용 domain summary |

## Draft Serving Flow

1. 앱이 시작되면 현재 세션을 정한다.
2. adapter가 source별 데이터를 가져온다.
3. source 내부에서만 dedup을 한다.
4. source feed를 panel별로 저장한다.
5. `company`, `company_kr`, `company_cn` 문서는 company panel filter를 먼저 수행한다.
6. 이 필터는 RAG가 아니라 instruction-only 분류로 두고, source item 단건 호출 대신 item chunk 단위 batch inference를 우선한다.
7. company panel에서는 `keep`으로 판정된 문서만 source feed와 summary 대상으로 올린다.
8. `discovery(새로움/반짝임)` + engagement + ranking을 함께 봐서 LLM summary 대상을 고른다.
9. 그 위에서 cluster와 digest를 만든다.
10. 홈 화면은 summary lane과 source lane을 함께 보여준다.
11. 클릭 시 `digest -> cluster -> document -> original url` 순서로 내려간다.

## Open Questions

- Redis만으로 충분한가, 아니면 JSONL snapshot을 기본으로 둘 것인가
- benchmark snapshot TTL을 어떻게 둘 것인가
- source별 최대 표시 개수를 어디서 자를 것인가
- summary 생성 대상을 어떤 기준으로 줄일 것인가
- reference / evidence 노출 스키마를 어디까지 표준화할 것인가

## Local Runtime Draft

| Component | Role |
|----------|------|
| **redis** | 세션 상태 저장소 |
| **collector** | source adapter 실행 |
| **enricher** | summary / cluster 생성 |
| **ui** | Open World Agents 화면 |

## Relationship To Other Docs

- source 자체는 [02.1 Sources](./02_sections/02_1_sources.md)에서 관리한다.
- field contract는 [02.2 Fields](./02_sections/02_2_fields.md)에서 본다.
- 제품 전체 형태는 [01. Overall Flow](./01_overall_flow.md)에서 본다.
- LLM 활용은 [04. LLM Usage](./04_llm_usage.md)에서 관리한다.
- 현재 구현된 collection flow는 [05. Data Collection Pipeline](./05_data_collection_pipeline.md)에서 본다.
