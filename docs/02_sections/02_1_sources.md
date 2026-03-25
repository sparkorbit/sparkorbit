[Index](../README.md) · [01. Overall Flow](../01_overall_flow.md) · [02. Sections](./README.md) · **02.1 Sources** · [03. Runtime Flow](../03_runtime_flow_draft.md) · [04. LLM Usage](../04_llm_usage.md) · [05. Data Collection Pipeline](../05_data_collection_pipeline.md) · [06. UI Design Guide](../06_ui_design_guide.md)

---

# SparkOrbit Docs - 02.1 Sources

> Canonical source list
> Last verified: 2026-03-23

## Purpose

이 문서는 SparkOrbit가 **앱 시작 시 바로 읽어올 source**를 정리하는 canonical 문서다. 여기서는 "어디서 가져오는가", "왜 이 source를 고르는가", "어떤 group으로 보여줄 것인가"에 집중한다.

구현 상태는 source마다 다를 수 있다. 현재 `all-source` 런에서 실제로 붙어 있는 항목과, 제품 watchlist에 있지만 scripted access나 URL 품질 때문에 빠진 항목을 같이 구분해서 본다.

## Source Selection Rules

1. 무료여야 한다.
2. 인증 없는 접근을 우선한다.
3. 앱 시작 시 한 번 수집해서 바로 화면을 채울 수 있어야 한다.
4. source feed는 panel별로 분리해서 보여준다.
5. 여러 source를 한 사건으로 묶는 일은 summary 단계에서만 한다.
6. 사용자가 클릭해 drill-down할 수 있도록, **displayable URL이 없는 item/source는 기본 화면 대상에서 제외**한다.

## Collection Methods

| Method | Why it matters |
|--------|----------------|
| **RSS / Atom** | 가장 안정적이고 바로 시작하기 좋다 |
| **REST API** | 구조화된 JSON을 받아오기 쉽다 |
| **GraphQL** | 필요한 필드만 고를 수 있지만 이번 MVP에선 보조적이다 |
| **Scrape** | RSS/API가 없을 때만 선택한다 |

## Hard Exclusion Rules

- `title`은 있어도 `url`, `canonical_url`, `reference_url`이 모두 비어 있으면 기본 feed에서 제외한다.
- source가 지속적으로 displayable URL을 주지 못하면 canonical source list에서는 후순위가 아니라 **제외 대상**으로 본다.
- `author`는 없어도 된다. 하지만 `title + reference URL + time field`는 가능한 한 유지해야 한다.
- `tags`는 검색/요약용 keyword 역할도 하므로, source/category/doc_type 기준으로 최소 키워드는 보정해서 넣는다.

## Core Source Groups

| Group | Main sources | Notes |
|------|--------------|-------|
| **Papers** | arXiv (cs.AI, cs.LG, cs.CL, cs.CV, cs.RO, cs.IR, cs.CR, stat.ML), Hugging Face daily papers | 연구 논문 |
| **Models** | Hugging Face models (likes/new/trending) | 모델 카드, 논문과 분리 |
| **Community** | Hacker News, Reddit, GitHub | 반응, 인기, OSS 신호 |
| **Company / Release** | OpenAI, Google AI Blog, Microsoft Research, NVIDIA, Apple ML, Amazon Science, Anthropic, DeepMind, Mistral | 회사 발표, 연구, 릴리즈 |
| **KR Company Additions** | Samsung Research, Kakao Tech, LG AI Research, NAVER Cloud Blog, Upstage | 국내 채널 보강 |
| **CN Company Additions** | Qwen, DeepSeek, Tencent-Hunyuan, PaddlePaddle, ByteDance, MindSpore | 중국 영향 기업 보강 |
| **Benchmarks** | LMArena, Open LLM Leaderboard | 별도 benchmark panel용 snapshot |

## 2.1.1 Papers

| Source | Method | Why keep it |
|--------|--------|-------------|
| **arXiv cs.AI** | RSS | AI 전반 논문 |
| **arXiv cs.LG** | RSS | 머신러닝 전반 |
| **arXiv cs.CL** | RSS | NLP, 언어 모델 |
| **arXiv cs.CV** | RSS | 컴퓨터 비전 |
| **arXiv cs.RO** | RSS | 로보틱스 |
| **arXiv cs.IR** | RSS | 정보 검색 |
| **arXiv cs.CR** | RSS | 보안 (AI safety 관련) |
| **arXiv stat.ML** | RSS | 통계적 ML |
| **HF daily_papers** | API | curated paper, 1순위 |

## 2.1.1-b Models (Paper panel에서 분리)

| Source | Method | Why keep it |
|--------|--------|-------------|
| **HF models likes** | API | 장기 인기/기본 레퍼런스 확인용 |
| **HF models new** | API | 막 올라온 신규 모델 탐지용 |
| **HF trending models** | API | 지금 반짝이는 모델 탐지용 |

## 2.1.2 Community / Developer

| Source | Method | Why keep it |
|--------|--------|-------------|
| **Hacker News** | API | 기술 커뮤니티 반응과 링크 허브 역할 |
| **Reddit** | `.json` / optional auth | subreddit별 관심사와 discussion 파악 |
| **GitHub** | REST API | release, repo, stars, updated_at 추적 |

## 2.1.3 Global Company Channels

| Org | Method | Priority note |
|-----|--------|---------------|
| **OpenAI** | RSS | 공식 발표용 primary |
| **Google AI Blog** | RSS | 연구 글 수집용 primary |
| **Microsoft Research** | RSS | 연구/시스템 글 수집용 primary |
| **NVIDIA** | RSS | AI/DL 블로그 수집용 primary |
| **Apple ML** | RSS | ML 연구 업데이트용 primary |
| **Amazon Science** | RSS | 연구 블로그 수집용 primary |
| **Hugging Face Blog** | RSS | 오픈 생태계 소식용 primary |
| **Anthropic** | Scrape | RSS가 없어 secondary |
| **Google DeepMind** | Scrape | 공식 블로그지만 scrape 전제 |
| **Mistral AI** | Scrape | 공지성 뉴스 확인용 |
| **Stability AI** | Scrape | 구조 변경 위험이 있어 secondary |
| **Groq** | Scrape | JS-heavy라 secondary |
| **Salesforce AI Research** | RSS | enterprise/agent/eval 연구 채널 |

## 2.1.4 Korea Additions

| Org | Method | Why keep it |
|-----|--------|-------------|
| **Samsung Research** | API-like POST JSON | 공식 구조화 endpoint가 보여서 안정적 |
| **Kakao Tech** | RSS | 공개 기술 블로그 |
| **LG AI Research** | API / Page | blog는 유지한다. news는 공개 detail URL이 불안정해 watchlist로 분리한다 |
| **NAVER Cloud Blog** | RSS | AI/클라우드 소식 보강 |
| **Upstage** | Scrape | 국내 AI 스타트업 관찰용 |

## 2.1.5 China Additions

| Org | Method | Why keep it |
|-----|--------|-------------|
| **Alibaba Qwen** | RSS | GitHub Pages feed라 접근 안정성 높음 |
| **DeepSeek** | Docs / Changelog | 모델/API 변경 추적에 좋음 |
| **Tencent-Hunyuan** | GitHub API | 공식 OSS 움직임 파악 |
| **PaddlePaddle / Baidu** | GitHub API | 중국권 대형 OSS 축 |
| **ByteDance** | GitHub API | 영향력 있는 공개 repo 추적 |
| **MindSpore / Huawei** | GitHub API | 중국 대기업 AI stack 보강 |

## 2.1.6 Benchmarks

| Source | Role | Caveat |
|--------|------|--------|
| **LMArena** | benchmark table/card panel | scrape 기반이라 secondary |
| **Open LLM Leaderboard** | structured leaderboard snapshot | HF datasets API 기반 |

### Benchmark Required Fields

benchmark source는 일반 article처럼 다루지 않고, 아래 필드를 우선 계약으로 본다.

| 필드 | 의미 |
|------|------|
| `benchmark.kind` | `leaderboard_panel`, `leaderboard_model_row` 등 |
| `benchmark.board_id` | board 고유 식별자 |
| `benchmark.board_name` | 화면 표시용 board 이름 |
| `benchmark.snapshot_at` | snapshot/submission 시점 |
| `benchmark.rank` | 가능한 경우 현재 순위 |
| `benchmark.score_label` | `Arena rating`, `Average ⬆️` 같은 점수 이름 |
| `benchmark.score_value` | 대표 점수 |
| `benchmark.score_unit` | 점수 단위/해석 |
| `benchmark.votes` | 모델별 투표 수 또는 참여 수치 |
| `benchmark.model_name` | 대표 모델명 |
| `benchmark.organization` | 회사/조직 |
| `benchmark.total_models` | board 전체 모델 수 |
| `benchmark.total_votes` | board 전체 투표 수 |

LMArena처럼 정보가 압축된 source는 `top_entries` 같은 원본 정보도 같이 보존하고, UI는 이 `benchmark` block을 우선 읽어 카드/표를 그리는 편이 안전하다.

## Currently Excluded / Watchlist

| Source | Why not in current all-source run |
|--------|-----------------------------------|
| **Meta AI** | `2026-03-23` scripted access 기준 `https://ai.meta.com/blog/` 응답이 불안정해 기본 all-source run에서는 제외 |
| **LG AI Research News** | API는 본문을 주지만 stable public detail URL을 제공하지 않고, 공개 `news/view` route도 `2026-03-24` 확인 기준 500을 반환해 crawl list에서 제외 |

## Related Docs

- Redis/session/serving 흐름 → [03. Runtime Flow](../03_runtime_flow_draft.md)
- LLM enrichment (company filter, paper domain) → [04. LLM Usage](../04_llm_usage.md)
- normalized field contract → [02.2 Fields](./02_2_fields.md)
