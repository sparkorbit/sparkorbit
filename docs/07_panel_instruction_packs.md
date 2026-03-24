[Index](./README.md) · [01. Overall Flow](./01_overall_flow.md) · [04. LLM Usage](./04_llm_usage.md) · [06. Operational Playbook](./06_operational_playbook.md) · **07. Panel Instruction Packs**

---

# SparkOrbit - 07. Panel Instruction Packs

> Canonical instruction-pack policy
> Last updated: 2026-03-24

## 0. 목적

이 문서는 panel별 LLM instruction을 어떻게 관리할지 정한다.

핵심 원칙:

- panel별 instruction은 분리한다
- instruction은 Markdown 파일로 version 관리한다
- runtime은 가능하면 그 Markdown prompt pack을 직접 읽는다
- prompt, schema, fallback rule은 함께 versioning 한다

## 1. 왜 panel별로 나누나

`Paper`, `Company`, `Community`, `Benchmark`는 의미 판단 기준이 다르다.

예를 들어:

- `Company / Release`는 keep/drop filtering과 domain 분류가 중요하다
- `Paper`는 topic grouping과 novelty 판단이 중요하다
- `Community`는 reaction intensity와 discussion quality가 중요하다
- `Benchmark`는 raw metric 해석과 watchout이 중요하다

따라서 하나의 범용 prompt보다 **panel별 instruction pack**이 더 안정적이다.

## 2. 현재 전략

현재는 `instruction-first`로 시작한다.

즉:

- system instruction을 강하게 준다
- 입력/출력 contract를 좁힌다
- enum과 JSON schema를 강하게 고정한다
- few-shot은 문서에는 남기되, runtime에는 필요할 때만 넣는다

이유는 현재 범위가 `Qwen3.5-4B` 기반의 구조화 enrichment이기 때문이다.
작은 모델에서는 heavy few-shot보다 **짧고 명확한 지시 + 좁은 schema**가 먼저 안정화되어야 한다.

## 3. 파일 규칙

prompt pack 파일은 아래 형식을 따른다.

```text
docs/prompt_packs/<pack_name>.md
```

예:

- `docs/prompt_packs/company_filter_v2.md`

파일 안에는 최소한 아래가 있어야 한다.

- pack purpose
- panel scope
- input contract
- output contract
- keep/drop or scoring rule
- domain definitions
- hard rules
- runtime prompt blocks

## 4. Runtime Rule

가능하면 runtime script는 prompt를 코드 상수로 두지 않고, `docs/prompt_packs/*.md`에서 읽는다.

즉, prompt 변경은:

1. Markdown prompt pack 수정
2. script가 같은 파일을 읽어 실행

형태로 관리한다.

## 5. 현재 canonical packs

| Pack | Panel | 용도 | 코드 |
|------|-------|------|------|
| [company_filter_v2](./prompt_packs/company_filter_v2.md) | Company / Release | keep/drop 판정 + domain 분류 | `llm_enrich.py` |
| [paper_domain_v1](./prompt_packs/paper_domain_v1.md) | Paper | 22개 연구 분야 분류 | `paper_enrich.py` |

### company_filter_v2

- `Company / Release` panel 후보를 독립적으로 분류
- 입력: `document_id`, `source`, `title`, `desc`(optional)
- 출력: `decision`, `company_domain`, `reason_code`
- domain disambiguation rule 포함 (model_release vs technical_research 등)

### paper_domain_v1

- arXiv + HF daily papers를 연구 domain별로 분류
- 입력: `document_id`, `title` (title-only — 매우 경량)
- 출력: `paper_domain` (22개 enum 중 하나)
- domain 우선순위 규칙 포함 (LLM+agent→agents 등)
