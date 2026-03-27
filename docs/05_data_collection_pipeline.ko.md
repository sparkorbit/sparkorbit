[Index](./README.ko.md) · [🇺🇸 English](./05_data_collection_pipeline.md) · [01. Overall Flow](./01_overall_flow.ko.md) · **05. Data Collection Pipeline**

---

# SparkOrbit Docs - 05. Data Collection Pipeline

> 한국어 대응 페이지
> Last updated: 2026-03-27

이 문서는 영어 기준 원문인 [05_data_collection_pipeline.md](./05_data_collection_pipeline.md)의 한국어 대응 페이지입니다.

## 이 문서에서 다루는 것

- `pipelines/source_fetch`의 실제 CLI entrypoint
- run output 구조와 canonical artifact
- `documents.ndjson`, `metrics.ndjson`, `labels/`, `logs/`의 역할
- 수집 파이프라인이 런타임/LLM 단계와 연결되는 방식

## 현재 기준

- 상세 기준 문서는 영어판 [05_data_collection_pipeline.md](./05_data_collection_pipeline.md)입니다.
- 한국어 버전은 문서 구조를 분리한 뒤 순차적으로 확장하고 있습니다.
- 로컬 실행 명령은 루트 [README](../README.ko.md)와 영어 원문을 함께 보는 것이 가장 정확합니다.
