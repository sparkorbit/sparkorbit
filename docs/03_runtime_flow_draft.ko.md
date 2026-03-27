[Index](./README.ko.md) · [🇺🇸 English](./03_runtime_flow_draft.md) · [01. Overall Flow](./01_overall_flow.ko.md) · **03. Runtime Flow**

---

# SparkOrbit Docs - 03. Runtime Flow

> 한국어 대응 페이지
> Last updated: 2026-03-27

이 문서는 영어 기준 원문인 [03_runtime_flow_draft.md](./03_runtime_flow_draft.md)의 한국어 대응 페이지입니다.

## 이 문서에서 다루는 것

- backend/app, Redis, frontend polling이 어떻게 연결되는지
- bootstrap / reload / publish / digest 흐름
- Redis session key 구조와 loading stage 이름
- frontend가 어떤 API를 어떤 순서로 읽는지

## 현재 기준

- 상세 기준 문서는 영어판 [03_runtime_flow_draft.md](./03_runtime_flow_draft.md)입니다.
- 파일명에 `_draft`가 남아 있어도 내용은 실제 구현 흐름을 기준으로 정리합니다.
- 한국어 버전은 문서 구조를 분리한 뒤 순차적으로 확장하고 있습니다.
