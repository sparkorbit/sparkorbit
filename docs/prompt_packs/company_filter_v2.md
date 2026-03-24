# company_filter_v2

## Metadata

- prompt_version: `company_filter_v2`
- schema_version: `document_filter_v2`
- panel: `company_release`
- strategy: `instruction_first`
- runtime_default: `ollama`
- model_default: `qwen3.5:4b`

## Purpose

이 prompt pack은 `Company / Release` panel 후보를 독립적으로 분류한다.

각 문서는 서로 비교하지 않는다.
각 문서는 **독립적인 classification item** 으로 처리한다.

모델은 각 문서마다 아래만 반환한다.

1. `decision`
2. `company_domain`
3. `reason_code`

## Scope

초기 대상:

- `source_category in {company, company_kr, company_cn}`
- `source == hf_blog`
- `published_at` 또는 `sort_at` 기준 최근 90일 문서

초기 제외:

- `community`
- `benchmark`
- `github_*`
- `hf_models_*`

## Keep Criteria

- model release, update, performance change
- API / SDK / product release, pricing or policy change
- technical blog, research result, framework
- open source release or important repository announcement
- benchmark or eval result
- major partnership, acquisition, ecosystem change
- safety, governance, regulation, policy response

## Drop Criteria

- conference recap, event sketch
- education program, academy, camp, seminar
- recruiting, hiring, culture, interview, PR
- general company promotion or organizational news

## Company Domains

- `model_release`
- `product_update`
- `technical_research`
- `open_source`
- `benchmark_eval`
- `partnership_ecosystem`
- `policy_safety`
- `others`

## Reason Codes

- `model_signal`
- `product_signal`
- `research_signal`
- `oss_signal`
- `benchmark_signal`
- `partnership_signal`
- `policy_signal`
- `other_signal`
- `event_or_program`
- `recruiting_or_pr`
- `general_promo`
- `unclear_scope`
- `runtime_fallback`

## Hard Rules

- 반드시 input의 `document_id`만 사용한다
- 각 문서를 독립적으로 판단한다
- 문서끼리 비교, 묶기, 요약하지 않는다
- input item마다 정확히 하나의 결과를 반환한다
- `drop`이면 `company_domain=null`
- `needs_review`이면 `company_domain`은 `null` 또는 가장 가까운 domain 하나만 사용한다
- URL, 날짜, source, 성능 수치 등 input에 없는 사실을 만들지 않는다
- 출력은 JSON array만 반환한다
- 설명 문장, markdown, extra text를 붙이지 않는다

## Input Contract

runtime은 아래만 준다. 필드명은 토큰 절약을 위해 축약한다.

- `id` — `document_id`의 축약
- `src` — `source`의 축약
- `title` — 그대로
- `desc` — `description` 앞 200자 (있을 때만, 없으면 생략)

※ `tags`, `published_at`, `engagement` 등은 LLM에 넘기지 않는다. 프론트가 `document_id`로 원본에서 직접 읽는다.

## Candidate Selection (pre-LLM)

runtime이 LLM에 넘기기 전에 적용하는 rule-based 필터:

- `source_category in {company, company_kr, company_cn}` 또는 `source == hf_blog`
- `published_at` 또는 `sort_at` 기준 최근 90일 (default)
- source별 최근 최대 5개 (default `--per-source 5`)
- `text_scope`가 `empty`, `metric_summary`, `generated_panel`이면 제외
- `github_*` 소스 제외

현재 full-collect 기준 553건 → 63건 (15개 소스, source당 최대 5건)으로 줄어든 뒤 LLM에 들어간다.
소스 수나 수집량이 변하면 이 수치도 바뀌므로, chunk_size는 여유를 두되 넘치면 chunk를 나눠 처리한다.

## Output Contract

runtime은 아래만 기대한다.

- `document_id`
- `decision`
- `company_domain`
- `reason_code`

## Runtime Prompt Blocks

```prompt-system
You classify AI/Tech company documents for a dashboard panel. Return one JSON result per input. Output JSON array only. No prose.
```

```prompt-user-template
Classify each document. Each input has "id", "src", "title", and optionally "desc".

Return for each: document_id (copy "id" exactly), decision, company_domain, reason_code.

decision: keep | drop | needs_review
company_domain (null if drop): model_release | product_update | technical_research | open_source | benchmark_eval | partnership_ecosystem | policy_safety | others
reason_code: model_signal | product_signal | research_signal | oss_signal | benchmark_signal | partnership_signal | policy_signal | other_signal | event_or_program | recruiting_or_pr | general_promo | unclear_scope

=== Domain disambiguation rules ===

model_release: ONLY when a NEW or UPDATED model is announced (e.g. "Introducing X model", "X model released", model card, model weights).
- A research paper describing a new technique is technical_research, NOT model_release.
- A safety/guard model (e.g. "SafetyGuard model") is model_release if the focus is the model itself.

product_update: API, SDK, platform, deployment, pricing change, release notes, new product feature, infrastructure expansion.
- A company expanding to a new region/data center is product_update, NOT partnership_ecosystem.
- A product launch event (e.g. "NVIDIA presents X at GTC") is product_update if the content is about the product, not the event.

technical_research: technical blog post, research paper, engineering deep-dive, methodology, algorithm, framework explanation.
- If the title sounds like a research paper or technical explanation, it is technical_research.
- Korean tech blogs about engineering practice (e.g. "보안 모니터링", "아키텍처 설계") are technical_research, NOT recruiting_or_pr.

partnership_ecosystem: ONLY explicit partnership, acquisition, alliance, investment, or joint venture announcements.
- A company presenting its own products at a conference is NOT partnership_ecosystem.

policy_safety: AI safety reports, governance frameworks, regulation response, compliance, responsible AI.

open_source: open-source repository, framework, library, or tooling release.

benchmark_eval: benchmark results, evaluation methodology, leaderboard updates.

others: keep-worthy content that does not clearly fit any domain above. Use this instead of forcing a bad fit.
- Use reason_code=other_signal for these.

=== Drop rules ===

drop = conference recap WITHOUT product substance, education/academy/bootcamp, recruiting/hiring/intern stories, coding test explanations, general company PR/culture, fellowship/grant announcements, promotional landing pages without substance.

reason_code for drop must match:
- event_or_program: conference, seminar, meetup, hackathon recap
- recruiting_or_pr: hiring, intern, culture, coding test, fellowship, grant, academy
- general_promo: landing page, company intro, generic news roundup

Documents:
{documents_json}
```
