# SparkOrbit - Agent Guide

## Read First

1. `CLAUDE.md`
2. `docs/01_overall_flow.md`
3. `docs/02_sections/02_1_sources.md`
4. `docs/02_sections/02_2_fields.md`
5. `docs/05_data_collection_pipeline.md`

## Current Code Reality

- 실제 구현은 `PoC/source_fetch` collection pipeline이다.
- 공식 CLI entrypoint는 `PoC/source_fetch/scripts/data_collection.py`
- 핵심 구현은 `adapters.py`, `models.py`, `pipeline.py`
- Redis/UI는 아직 target architecture 문서 단계다.

## Core Principles

1. 설치 즉시 동작
2. 무료만 사용
3. 인증 없는 소스 우선
4. 해커톤답게 단순하게 유지

## Working Rules

- source별 adapter는 독립적으로 유지한다.
- HTTP 에러나 파싱 실패는 skip하고 다음 source로 간다.
- 날짜는 ISO 8601(UTC)로 정규화한다.
- URL 없는 문서는 기본 서빙 대상에서 제외한다.
- normalized contract는 field shape를 유지한다.
- 우선순위는 `discovery + engagement + ranking` 기준으로 본다.
- 실제 구현과 target architecture 문서를 섞지 않는다.
