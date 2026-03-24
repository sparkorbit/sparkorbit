# SparkOrbit - Working Notes

## 프로젝트 방향

AI/Tech 정보를 한 화면에서 탐색하는 `Open World Agents` 기반 world monitor 프로젝트다.

## 먼저 읽을 문서

1. `docs/01_overall_flow.md`
2. `docs/02_sections/02_1_sources.md`
3. `docs/02_sections/02_2_fields.md`
4. `docs/05_data_collection_pipeline.md`
5. `docs/04_llm_usage.md`

## 현재 구현된 코드 범위

- 실제 구현은 `PoC/source_fetch` 아래의 source collection pipeline이다.
- 공식 entrypoint는 `PoC/source_fetch/scripts/data_collection.py` 하나다.
- 핵심 구현 파일:
  - `PoC/source_fetch/scripts/source_fetch/adapters.py`
  - `PoC/source_fetch/scripts/source_fetch/models.py`
  - `PoC/source_fetch/scripts/source_fetch/pipeline.py`
- 실행 결과는 `PoC/source_fetch/data/runs/<run_id>/` 아래에 `raw + normalized + sample + logs`로 저장된다.

## 목표 아키텍처와 구현 상태

- `docs/05_data_collection_pipeline.md`
  현재 구현된 PoC pipeline 설명
- `docs/03_runtime_flow_draft.md`
  Redis/UI를 포함한 target architecture 초안

이 둘을 혼동하지 않는 것이 중요하다.

## 핵심 원칙

1. 설치 즉시 동작
2. 무료만 사용
3. 인증 없는 소스 우선
4. 과하게 만들지 않기

## 작업 시 주의사항

- source별 adapter는 독립적으로 유지한다.
- HTTP 에러나 파싱 실패는 skip하고 다음 source로 넘어간다.
- 날짜는 수집 시점에 ISO 8601(UTC)로 변환한다.
- URL 없는 문서는 기본 서빙 대상에서 제외한다.
- normalized contract는 shape를 유지한다. 값이 없으면 `null`, `[]`, `{}` 를 쓴다.
- LLM/서빙 우선순위는 `discovery + engagement + ranking` 기준으로 본다.
