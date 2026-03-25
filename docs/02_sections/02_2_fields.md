[Index](../README.md) · [01. Overall Flow](../01_overall_flow.md) · [02. Sections](./README.md) · [02.1 Sources](./02_1_sources.md) · **02.2 Fields** · [03. Runtime Flow](../03_runtime_flow_draft.md) · [04. LLM Usage](../04_llm_usage.md) · [05. Data Collection Pipeline](../05_data_collection_pipeline.md) · [06. UI Design Guide](../06_ui_design_guide.md)

---

# SparkOrbit Docs - 02.2 Normalized Document Fields

> 수집 후 정규화된 문서(documents.ndjson)의 필드 레퍼런스
> 실데이터 기준: 2026-03-23

## Purpose

이 문서는 수집 → 정규화를 거친 문서가 **어떤 필드를 갖고, 각 필드에 어떤 값이 들어가는지**를 정리한다. Enrichment, LLM 파이프라인, 프론트엔드 서빙에서 "이 필드에 뭐가 들어있지?"를 확인할 때 쓴다.

<!-- ────────────────────────────────────────────
     이 문서의 읽는 순서 가이드:
     1~1.4  필드 정의 (필수/보조/내부)
     2      enum 값 정의 (source_category, doc_type 등)
     3      engagement 상세 (소스별 지표, 스케일, discovery, ranking)
     4      external IDs
     5      URL 패턴 (소스별 원본 링크)
     6      reference 블록
     7      tags 체계
     8      LLM enrichment 결과 (company filter, paper domain)
     9      소스별 필드 커버리지 매트릭스
     ──────────────────────────────────────────── -->

---

## 1. Document 최상위 필드

"필수"는 **화면 표시를 위해 강하게 기대하는 필드**를 뜻한다. 다만 현재 구현에서 실제 hard filter는 `title + displayable URL` 기준이고, 시간 필드는 `published_at` 대신 `sort_at` fallback을 허용한다.

### 1.1 필수 필드 (화면 표시용)

| 필드 | 타입 | 설명 |
|------|------|------|
| `title` | string | 문서 제목. 카드, 목록, 요약의 기본 텍스트 |
| `reference_url` | string | 클릭 시 이동할 URL (Level 3 드릴다운 대상) |
| `source` | string | 소스 어댑터 이름. 섹션 배치와 라벨 표시에 사용 |
| `source_category` | string | 소스 그룹 분류. UI 섹션 매핑 기준 |
| `published_at` | string (UTC) | 게시 시점. 가장 좋은 시간 필드지만, 현재 구현은 없을 경우 `sort_at` fallback을 허용 |
| `tags` | list[string] | 키워드 클러스터링, 필터, 검색에 사용 |
| `engagement` | object | 소스별 engagement 지표. 핫한 정도 판단과 정렬 기준 |
| `engagement_primary` | object | 대표 engagement 1개. `{name, value}` 형태로 소스 간 비교 가능 |

### 1.2 표시 보조 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `description` | string | 짧은 설명/리드 텍스트. 카드 미리보기에 사용 |
| `body_text` | string | 본문 텍스트. Level 2 상세 보기에 사용. 없는 소스도 있음 (HN 등) |
| `author` | string | 대표 작성자. 표시용 |
| `doc_type` | string | 문서 유형 (`paper`, `blog`, `news`, `post`, `repo` 등). 아이콘/라벨 구분 |
| `reference` | object | UI에 바로 쓸 수 있는 pre-formatted 블록 (`display_title`, `display_url`, `snippet`, `source_label`) |
| `related_urls` | list[string] | 썸네일 이미지, 토론 링크, 프로젝트 홈 등 보조 URL |

### 1.3 내부 처리 필드

화면에 직접 보이지 않지만 파이프라인 동작에 필요한 필드.

| 필드 | 타입 | 설명 |
|------|------|------|
| `document_id` | string | `{source}:{source_item_id}` 형태의 내부 식별자. 중복 방지 |
| `source_item_id` | string | 소스 내 고유 식별자 |
| `run_id` | string | 수집 실행 ID |
| `source_method` | string | 수집 방식 (`rss`, `api`, `scrape`) |
| `source_endpoint` | string | 실제 요청한 URL |
| `url` | string | 원본 URL (`reference_url`과 다를 수 있음 — HN, Reddit 등) |
| `canonical_url` | string | 정규화된 대표 URL. 중복 방지용 |
| `authors` | list[string] | 다중 작성자 보존 |
| `updated_at` | string (UTC) | 수정 시점 |
| `sort_at` | string (UTC) | 정렬 기준 시점 (`published_at` → `updated_at` → `fetched_at` 순 fallback) |
| `time_semantics` | string | 시간 필드의 의미 (`published`, `updated`, `snapshot` 등) |
| `timestamp_kind` | string | 시간 소스 종류 |
| `content_type` | string | 서빙용 유형 (현재 `doc_type`과 동일) |
| `summary_input_text` | string | LLM 입력용 정리 텍스트. `title + description + body_text`를 합쳐 8000자 이내로 정리 |
| `text_scope` | string | 본문 품질/범위 (`full_text`, `abstract`, `excerpt`, `empty` 등) |
| `content_format` | string | 텍스트 포맷 (`plain_text` 등) |
| `language` | string | 문서 언어 (`EN`, `KO` 등). 대부분 null |
| `discovery` | object | 새로움/반짝임 판단용 block |
| `ranking` | object | live monitor 화면 정렬용 block |
| `external_ids` | object | 외부 식별자 (`arxiv_id`, `hn_id` 등). 클러스터링/중복 방지 |
| `metadata` | object | 소스별 추가 메타데이터 |
| `llm` | object | LLM Enrichment 결과 저장 영역 |
| `raw_ref` | object | 원본 payload 참조 포인터 |
| `fetched_at` | string (UTC) | 수집 시점 |

### 1.4 내부 처리 필드 보충 설명

#### `summary_input_text`

LLM에 넣기 위해 `title + description + body_text`를 합쳐서 정리한 텍스트. 소스마다 `body_text` 상태가 다르기 때문에 이 필드가 존재한다.

- 중복 제거: title과 description이 같은 내용이면 한 번만 포함
- 8000자 제한: 긴 본문은 잘라서 LLM context를 절약
- fallback: `body_text`가 없어도 `title + description`으로 채움

```
title:       "Qwen3Guard: Real-time Safety for Your Token Stream"
description: "We introduce Qwen3Guard, a safety layer..."
body_text:   "Qwen3Guard is designed to... (full article)"

→ summary_input_text:
  "Qwen3Guard: Real-time Safety for Your Token Stream\n\n
   We introduce Qwen3Guard, a safety layer...\n\n
   Qwen3Guard is designed to... (8000자까지)"
```

#### `text_scope`

`body_text`의 품질을 나타내는 필드. LLM이 이 문서를 요약할 수 있는지 판단할 때 사용.
- `full_text`: 본문 전체 있음 → 요약 가능
- `abstract`: 논문 초록만 있음 → 요약 가능하지만 짧음
- `excerpt`: 일부만 있음 → 제한적 요약
- `metadata_only`: 본문 없이 메타데이터만 → 제목+태그 기반 처리
- `empty`: 아무것도 없음 (HN 등) → engagement와 title만 활용

---

## 2. Enum 필드 값 정의

### 2.1 `source_category`

소스를 UI 섹션에 매핑할 때 사용하는 1차 분류.

| 값 | 의미 | 해당 소스 |
|----|------|-----------|
| `papers` | 논문 | arxiv_rss_cs_ai, arxiv_rss_cs_lg, arxiv_rss_cs_cl, arxiv_rss_cs_cv, arxiv_rss_cs_ro, arxiv_rss_cs_ir, arxiv_rss_cs_cr, arxiv_rss_stat_ml, hf_daily_papers |
| `models` | HF 모델 카드 | hf_models_likes, hf_models_new, hf_trending_models |
| `community` | 커뮤니티/개발자 | hn_topstories, reddit_localllama, reddit_machinelearning, github_curated_repos |
| `company` | 글로벌 기업 | openai_news_rss, google_ai_blog, microsoft_research, nvidia_deep_learning, apple_ml, amazon_science, hf_blog, anthropic_news, deepmind_blog, groq_newsroom, mistral_news, stability_news, salesforce_ai_research_rss |
| `company_kr` | 한국 기업 | samsung_research_posts, kakao_tech_rss, lg_ai_research_blog, naver_cloud_blog_rss, upstage_blog |
| `company_cn` | 중국 기업 | qwen_blog_rss, deepseek_updates, github_tencent_hunyuan_repos, github_paddlepaddle_repos, github_bytedance_repos, github_mindspore_repos |
| `benchmark` | 벤치마크 | lmarena_overview, open_llm_leaderboard |

### 2.2 `doc_type` / `content_type`

문서의 원본 유형. 현재 `doc_type`과 `content_type`은 동일한 값을 갖는다.

| 값 | 의미 | 해당 소스 |
|----|------|-----------|
| `paper` | 학술 논문/프리프린트 | arxiv_rss_cs_ai, arxiv_rss_cs_lg, hf_daily_papers |
| `blog` | 블로그/기술 포스트 | openai_news_rss, google_ai_blog, microsoft_research, nvidia_deep_learning, apple_ml, amazon_science, hf_blog, qwen_blog_rss, salesforce_ai_research_rss, kakao_tech_rss, naver_cloud_blog_rss, samsung_research_posts, lg_ai_research_blog, upstage_blog |
| `news` | 뉴스/발표 | anthropic_news, mistral_news, stability_news, groq_newsroom |
| `post` | 커뮤니티 게시글 | reddit_localllama, reddit_machinelearning |
| `story` | HN 링크 포스트 | hn_topstories |
| `model` | HF 모델 카드 | hf_models_likes, hf_models_new |
| `model_trending` | HF 트렌딩 모델 | hf_trending_models |
| `repo` | GitHub 리포지토리 | github_curated_repos, github_bytedance_repos, github_tencent_hunyuan_repos, github_paddlepaddle_repos, github_mindspore_repos |
| `release` | GitHub 릴리즈 | github_curated_repos, github_paddlepaddle_repos |
| `release_note` | 변경 로그/릴리즈 노트 | deepseek_updates |
| `benchmark` | 벤치마크 모델 행 | open_llm_leaderboard |
| `benchmark_panel` | 벤치마크 전체 패널 | lmarena_overview |

### 2.3 `text_scope`

본문(`body_text`)의 품질과 범위를 나타낸다. LLM 입력 전략을 결정할 때 핵심 필드.

| 값 | 의미 | 해당 소스 |
|----|------|-----------|
| `full_text` | 본문 전체 또는 충분한 길이 | 대부분의 RSS/scrape/API 소스 |
| `abstract` | 논문 초록 | arxiv_rss_cs_ai, arxiv_rss_cs_lg, hf_daily_papers |
| `excerpt` | 본문 일부/요약 발췌 | deepmind_blog, openai_news_rss, samsung_research_posts |
| `metadata_only` | 본문 없음, 메타데이터만 | hf_models_likes, hf_trending_models, github_*_repos |
| `metric_summary` | 수치 기반 요약 | open_llm_leaderboard |
| `generated_panel` | 생성된 패널 텍스트 | lmarena_overview |
| `empty` | 본문 없음 | hn_topstories (외부 링크만), github_mindspore_repos |

### 2.4 `time_semantics`

`published_at` / `sort_at`이 무엇을 의미하는지. 정렬/집계 시 해석이 달라진다.

| 값 | 의미 | 해당 소스 |
|----|------|-----------|
| `published` | 게시/발행 시점 | 대부분의 소스 (블로그, 뉴스, 논문, 커뮤니티) |
| `updated` | 최종 수정/push 시점 | github_*_repos |
| `created` | 최초 생성 시점 | hf_models_likes |
| `snapshot` | 스냅샷 수집 시점 | lmarena_overview |
| `submission` | 제출/등록 시점 | open_llm_leaderboard |

### 2.5 `source_method`

| 값 | 의미 |
|----|------|
| `rss` | RSS/Atom 피드 파싱 |
| `api` | REST API JSON 응답 |
| `scrape` | HTML 페이지 스크래핑 |

---

## 3. Engagement 필드 상세

### 3.1 소스별 수집 지표

| 소스 | 수집 필드 | 의미 |
|------|-----------|------|
| **hn_topstories** | `score`, `comments` | score = 순수 upvote 수 (downvote 없음) |
| **reddit_localllama** | `score`, `comments`, `upvote_ratio` | score = upvote − downvote. upvote_ratio가 0.5에 가까우면 논쟁적 |
| **reddit_machinelearning** | `score`, `comments`, `upvote_ratio` | 위와 동일 |
| **hf_models_likes** | `likes`, `downloads` | likes = 장기 인기, downloads = 누적 사용량 |
| **hf_models_new** | `likes`, `downloads` | newly created 모델의 초기 신호 확인 |
| **hf_trending_models** | `likes`, `downloads` | 위와 동일 |
| **hf_daily_papers** | `comments` | HF papers 페이지 댓글 수 |
| **github_curated_repos** | `stars`, `forks`, `watchers`, `open_issues` | stars = 관심도, forks = 활용도 |
| **github_*_repos** | `stars`, `forks`, `watchers`, `open_issues` | 위와 동일 (org별 repos) |
| **github_curated_repos** (release) | `assets` | 릴리즈 첨부 파일 수 |
| **lg_ai_research_blog** | `read_count` | 블로그 조회수 (내부 집계) |
| **lmarena_overview** | `votes`, `rating`, `rank` | votes = 사용자 투표 수, rating = Elo 유사 점수, rank = 순위 |

engagement가 **없는** 소스 (빈 `{}` 반환):
- arXiv (RSS에 engagement 없음)
- 기업 블로그 대부분 (OpenAI, Google AI, NVIDIA, Apple ML, Amazon Science, Anthropic, DeepMind, Mistral, Stability, Groq, Salesforce, Qwen, DeepSeek, Kakao, NAVER, Samsung, Upstage)
- HF Blog
- Open LLM Leaderboard

### 3.2 `engagement_primary` 선택 규칙

하나의 문서에 여러 engagement 지표가 있을 때, 아래 우선순위로 대표 지표 1개를 자동 선택한다.

```
score > upvotes > likes > stars > votes > downloads > comments > read_count
```

| 소스 예시 | engagement 원본 | primary 결과 |
|-----------|-----------------|-------------|
| Reddit | `{score: 180, comments: 40, upvote_ratio: 0.9}` | `{name: "score", value: 180}` |
| HF Model | `{likes: 13100, downloads: 1649989}` | `{name: "likes", value: 13100}` |
| HF New Model | `{likes: 2, downloads: 31}` | `{name: "likes", value: 2}` |
| GitHub | `{stars: 158291, forks: 32580}` | `{name: "stars", value: 158291}` |
| HF Paper | `{comments: 1}` | `{name: "comments", value: 1}` |
| arXiv | `{}` | `{name: null, value: null}` |

### 3.3 소스 간 스케일 차이

같은 숫자라도 소스마다 의미가 다르다. engagement 필터는 **소스별로 threshold를 분리**해야 한다.

| 지표 | "보통" | "핫함" | "매우 핫함" |
|------|--------|--------|------------|
| HN score | 30–100 | 100–300 | 300+ |
| Reddit score (LocalLLaMA) | 50–100 | 100–300 | 300+ |
| Reddit score (MachineLearning) | 20–50 | 50–150 | 150+ |
| HF likes (모델) | 100–500 | 500–3,000 | 3,000+ |
| HF downloads (모델) | 10K–100K | 100K–1M | 1M+ |
| GitHub stars | 100–1,000 | 1,000–5,000 | 5,000+ |
| LG AI read_count | 0–50 | 50–200 | 200+ |

### 3.4 Engagement 필터 전략

| 소스 그룹 | 필터 전략 | 이유 |
|-----------|-----------|------|
| Community (HN, Reddit) | engagement threshold로 노이즈 제거 | 글이 많고 품질 편차가 큼 |
| Papers (arXiv, HF papers) | 필터 없이 전부 통과 | 새 논문은 engagement가 아직 없음 |
| Company (RSS/Scrape) | 필터 없이 전부 통과 | 발표 자체가 뉴스 가치 |
| Models (HF) | `new + trending + likes`를 같이 본다 | 장기 인기보다 discovery 우선 |
| Benchmark | 전부 통과 | 순위 변동 자체가 정보 |
| GitHub | stars 기준 또는 최근 push 기준 | 활발한 repo 우선 |

### 3.5 Discovery 필드

모델/릴리즈처럼 “지금 막 뜨는 것”을 보고 싶은 소스는 engagement만으로 부족하다. 그래서 정규화 단계에서 `discovery` block을 같이 계산한다.

```json
{
  "discovery": {
    "is_new": true,
    "age_hours": 3.4,
    "freshness_bucket": "new",
    "spark_score": 87,
    "spark_bucket": "sparkling",
    "primary_reason": "trending_feed"
  }
}
```

| 필드 | 의미 |
|------|------|
| `is_new` | 최근 생성/게시된 항목인지 |
| `age_hours` | `sort_at` 대비 현재 수집 시점 경과 시간 |
| `freshness_bucket` | `just_now`, `new`, `recent`, `active`, `established` |
| `spark_score` | 새로움 + 트렌딩 + engagement를 합친 휴리스틱 점수 |
| `spark_bucket` | `sparkling`, `rising`, `new`, `steady` |
| `primary_reason` | 점수가 높아진 주된 이유 (`new_model_feed`, `trending_feed`, `fresh_release` 등) |

실전에서는:
- `hf_models_new`는 **방금 생긴 모델**을 보는 lane
- `hf_trending_models`는 **지금 반짝이는 모델**을 보는 lane
- `hf_models_likes`는 **이미 검증된 장기 인기 모델**을 보는 lane

이 세 축을 같이 보되, 기본 정렬은 `ranking.feed_score DESC`, 같은 점수 안에서는 `sort_at DESC`, 그 다음 보조 정렬로 `engagement_primary.value DESC`를 쓰는 편이 더 목적에 맞다.

### 3.6 Feed Ranking 필드

`discovery`는 “이 아이템이 왜 새롭고 뜨는가”를 설명하는 block이고, `ranking`은 “live monitor 화면에서 위/아래 어디에 둘 것인가”를 설명하는 block이다.

```json
{
  "ranking": {
    "feed_score": 91,
    "feed_bucket": "top",
    "age_penalty": 5,
    "evergreen_bonus": 8,
    "priority_reason": "fresh_and_hot"
  }
}
```

| 필드 | 의미 |
|------|------|
| `feed_score` | 화면용 최종 정렬 점수. 높을수록 위 |
| `feed_bucket` | `top`, `live`, `recent`, `archive` |
| `age_penalty` | 오래된 정보일수록 차감되는 점수 |
| `evergreen_bonus` | 오래됐지만 여전히 강한 인기/다운로드/스타를 가진 경우의 보정 |
| `priority_reason` | 상단/하단 배치 이유 (`fresh_and_hot`, `hot_now`, `evergreen`, `older_item`) |

의도는 아래와 같다.

- `top`
  지금 바로 위에서 보여줘야 하는 새롭고 핫한 정보
- `live`
  아직 충분히 신선하고 반응이 좋은 정보
- `recent`
  실시간성은 조금 떨어지지만 계속 볼 가치가 있는 정보
- `archive`
  정보는 남기되 화면 아래로 내릴 오래된 정보

즉 오래된 정보는 자동으로 사라지지 않지만, `age_penalty` 때문에 위쪽 headline/ticker 영역에서는 밀리고 아래쪽 backlog 영역으로 가게 된다.

---

## 4. External IDs

소스별로 수집되는 외부 식별자. 클러스터링과 중복 방지에 활용.

| 필드 | 해당 소스 | 예시 |
|------|-----------|------|
| `external_ids.arxiv_id` | arxiv_rss_cs_ai, arxiv_rss_cs_lg | `2503.12345` |
| `external_ids.feed_entry_id` | RSS 기반 소스 전부 | feed entry의 고유 ID |
| `external_ids.hf_model_id` | hf_models_likes, hf_trending_models | `deepseek-ai/DeepSeek-R1` |
| `external_ids.hn_id` | hn_topstories | `12345678` |
| `external_ids.reddit_id` | reddit_localllama, reddit_machinelearning | `t3_abc123` |
| `external_ids.github_repo_id` | github_*_repos | `owner/repo` |

---

## 5. URL 필드와 소스별 Original Link 패턴

### 5.1 URL 관련 필드 역할

| 필드 | 역할 | 예시 |
|------|------|------|
| `source_endpoint` | 수집 시 요청한 API/RSS/페이지 URL | `https://rss.arxiv.org/rss/cs.AI` |
| `url` | 원본 콘텐츠 URL (기사, 논문, 모델 페이지) | `https://arxiv.org/abs/2603.19429` |
| `canonical_url` | 정규화된 대표 URL (중복 방지용) | `https://arxiv.org/abs/2603.19429` |
| `reference_url` | **UI에서 클릭 시 이동할 URL** (드릴다운 Level 3) | HN: 토론 페이지, 나머지: url과 동일 |
| `reference.display_url` | 카드에 표시할 URL 텍스트 | `reference_url`과 동일 |
| `related_urls` | 보조 URL (썸네일, 토론 링크, 프로젝트 홈) | `["https://cdn..../image.png"]` |

### 5.2 URL 분리가 중요한 소스

대부분의 소스는 `url == canonical_url == reference_url`이지만, 아래 소스는 다르다.

| 소스 | `url` (원본) | `reference_url` (클릭 대상) | 왜 다른가 |
|------|-------------|---------------------------|-----------|
| **hn_topstories** | 외부 원문 링크 (`https://rz01.org/...`) | HN 토론 페이지 (`https://news.ycombinator.com/item?id=...`) | 토론이 더 가치 있음 |
| **reddit_***, | 게시물 원본/갤러리 (`https://www.reddit.com/gallery/...`) | 댓글 페이지 (`https://www.reddit.com/r/.../comments/...`) | 토론 컨텍스트 포함 |
| **open_llm_leaderboard** | 모델 페이지 (`https://huggingface.co/...`) | 상세 결과 페이지 (`https://huggingface.co/datasets/open-llm-leaderboard/...`) | 벤치마크 상세 |
| **hf_daily_papers** | arXiv 논문 (`https://arxiv.org/abs/...`) | 동일 | 단, `related_urls`에 GitHub repo 포함 가능 |

### 5.3 소스별 Endpoint & Original Link 패턴

#### Papers

| 소스 | 수집 endpoint | original link 패턴 |
|------|--------------|-------------------|
| `arxiv_rss_cs_ai` | `https://rss.arxiv.org/rss/cs.AI` | `https://arxiv.org/abs/{arxiv_id}` |
| `arxiv_rss_cs_lg` | `https://rss.arxiv.org/rss/cs.LG` | `https://arxiv.org/abs/{arxiv_id}` |
| `hf_daily_papers` | `https://huggingface.co/api/daily_papers` | `https://arxiv.org/abs/{arxiv_id}` |
| `hf_models_likes` | `https://huggingface.co/api/models?sort=likes&limit=20` | `https://huggingface.co/{org}/{model}` |
| `hf_models_new` | `https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=20` | `https://huggingface.co/{org}/{model}` |
| `hf_trending_models` | `https://huggingface.co/api/trending?type=model` | `https://huggingface.co/{org}/{model}` |

#### Community

| 소스 | 수집 endpoint | original link 패턴 |
|------|--------------|-------------------|
| `hn_topstories` | `https://hacker-news.firebaseio.com/v0/topstories.json` | url: 외부 원문 / reference_url: `https://news.ycombinator.com/item?id={hn_id}` |
| `reddit_localllama` | `https://www.reddit.com/r/LocalLLaMA/.json?limit=20` | `https://www.reddit.com/r/LocalLLaMA/comments/{id}/...` |
| `reddit_machinelearning` | `https://www.reddit.com/r/MachineLearning/.json?limit=20` | `https://www.reddit.com/r/MachineLearning/comments/{id}/...` |

#### Global Company (RSS)

| 소스 | 수집 endpoint | original link 패턴 |
|------|--------------|-------------------|
| `openai_news_rss` | `https://openai.com/news/rss.xml` | `https://openai.com/index/{slug}` |
| `google_ai_blog` | `https://blog.research.google/feeds/posts/default` | `http://blog.research.google/{year}/{month}/{slug}.html` |
| `microsoft_research` | `https://www.microsoft.com/en-us/research/feed/` | `https://www.microsoft.com/en-us/research/blog/{slug}/` |
| `nvidia_deep_learning` | `https://blogs.nvidia.com/blog/category/deep-learning/feed/` | `https://blogs.nvidia.com/blog/{slug}/` |
| `apple_ml` | `https://machinelearning.apple.com/rss.xml` | `https://machinelearning.apple.com/research/{slug}` |
| `amazon_science` | `https://www.amazon.science/index.rss` | `https://www.amazon.science/blog/{slug}` |
| `hf_blog` | `https://huggingface.co/blog/feed.xml` | `https://huggingface.co/blog/{org}/{slug}` |
| `salesforce_ai_research_rss` | `https://www.salesforce.com/blog/category/ai-research/feed/` | `https://www.salesforce.com/blog/{slug}/` |

#### Global Company (Scrape)

| 소스 | 수집 endpoint | original link 패턴 |
|------|--------------|-------------------|
| `anthropic_news` | `https://www.anthropic.com/news` | `https://www.anthropic.com/{slug}` |
| `deepmind_blog` | `https://deepmind.google/blog/` | `https://deepmind.google/blog/{slug}/` |
| `mistral_news` | `https://mistral.ai/news/` | `https://mistral.ai/news/{slug}` |
| `stability_news` | `https://stability.ai/news-updates` | `https://stability.ai/news-updates/{slug}` |
| `groq_newsroom` | `https://groq.com/newsroom` | `https://groq.com/newsroom/{slug}` |

#### Korea

| 소스 | 수집 endpoint | original link 패턴 |
|------|--------------|-------------------|
| `samsung_research_posts` | `https://research.samsung.com/blogMain/list.json` | `https://research.samsung.com/blog/{slug}` |
| `kakao_tech_rss` | `https://tech.kakao.com/feed/` | `https://tech.kakao.com/posts/{id}` |
| `lg_ai_research_blog` | `https://www.lgresearch.ai/api/board/blog/list` | `https://www.lgresearch.ai/blog/view?seq={seq}` |
| `naver_cloud_blog_rss` | `https://rss.blog.naver.com/n_cloudplatform.xml` | `https://blog.naver.com/n_cloudplatform/{id}` |
| `upstage_blog` | `https://www.upstage.ai/blog` | `https://www.upstage.ai/blog/en/{slug}` |

#### China

| 소스 | 수집 endpoint | original link 패턴 |
|------|--------------|-------------------|
| `qwen_blog_rss` | `https://qwenlm.github.io/blog/index.xml` | `https://qwenlm.github.io/blog/{slug}/` |
| `deepseek_updates` | `https://api-docs.deepseek.com/updates/` | `https://api-docs.deepseek.com/news/{slug}` |
| `github_tencent_hunyuan_repos` | `https://api.github.com/orgs/Tencent-Hunyuan/repos?sort=updated` | `https://github.com/Tencent-Hunyuan/{repo}` |
| `github_paddlepaddle_repos` | `https://api.github.com/orgs/PaddlePaddle/repos?sort=updated` | `https://github.com/PaddlePaddle/{repo}` |
| `github_bytedance_repos` | `https://api.github.com/orgs/bytedance/repos?sort=updated` | `https://github.com/bytedance/{repo}` |
| `github_mindspore_repos` | `https://api.github.com/orgs/mindspore-ai/repos?sort=updated` | `https://github.com/mindspore-ai/{repo}` |

#### Benchmarks

| 소스 | 수집 endpoint | original link 패턴 |
|------|--------------|-------------------|
| `lmarena_overview` | `https://arena.ai/leaderboard` | `https://arena.ai/leaderboard/text` |
| `open_llm_leaderboard` | `https://datasets-server.huggingface.co/rows?dataset=open-llm-leaderboard/contents&...` | model: `https://huggingface.co/{org}/{model}` / details: `https://huggingface.co/datasets/open-llm-leaderboard/{org}__{model}-details` |

#### GitHub (Curated)

| 소스 | 수집 endpoint | original link 패턴 |
|------|--------------|-------------------|
| `github_curated_repos` (repo) | `https://api.github.com/repos` | `https://github.com/{org}/{repo}` |
| `github_curated_repos` (release) | `https://api.github.com/repos/{org}/{repo}/releases` | `https://github.com/{org}/{repo}/releases/tag/{tag}` |

### 5.4 `related_urls` 수집 현황

| 소스 | related_urls에 포함되는 것 |
|------|--------------------------|
| **hn_topstories** | HN 토론 페이지 |
| **reddit_*** | 댓글 페이지, 썸네일 이미지 |
| **hf_daily_papers** | GitHub repo (있을 때), 논문 썸네일 |
| **hf_blog** | 블로그 썸네일 |
| **anthropic_news** | 원본 URL, hero 이미지 |
| **deepmind_blog** | 원본 URL, 대표 이미지 |
| **google_ai_blog** | 블로그 이미지들 |
| **github_*_repos** | 프로젝트 홈페이지 (있을 때) |
| **lg_ai_research_blog** | 썸네일 이미지, 본문 이미지, VOD URL |
| **nvidia_deep_learning** | 대표 이미지 |
| **samsung_research_posts** | 썸네일 이미지 |
| **lmarena_overview** | 1위 모델 관련 뉴스 링크 |

### 5.5 URL 없는 소스 주의

| 소스 | 상태 | 대응 |
|------|------|------|
| `lg_ai_research_news` | stable public detail URL이 없고 공개 `news/view` route도 불안정 | crawl list/watchlist에서 제외 |
| `hn_topstories` | `body_text` 없음 (외부 링크만) | `text_scope: empty`, 제목 + 원문 링크 + engagement로 활용 |

---

## 6. Reference 블록

UI에서 문서를 표시할 때 바로 쓸 수 있는 pre-formatted 블록.

| 필드 | 역할 | 예시 |
|------|------|------|
| `reference.display_title` | 카드에 표시할 제목 | `"Qwen3Guard: Real-time Safety..."` |
| `reference.display_url` | 클릭 대상 URL (= `reference_url`) | `"https://qwenlm.github.io/blog/qwen3guard/"` |
| `reference.source_label` | 소스 표시 라벨 | `"arxiv_rss_cs_ai"`, `"reddit_localllama"` |
| `reference.snippet` | 미리보기 텍스트 | 본문/설명에서 추출한 200자 내외 |

---

## 7. Tags 체계

`tags`는 자동 부여되며, 아래 레이어로 구성된다.

### 7.1 자동 부여 태그

| 레이어 | 예시 | 부여 기준 |
|--------|------|-----------|
| 소스 카테고리 | `community`, `company`, `benchmark`, `papers`, `models` | `source_category`에서 파생 |
| 지역 | `kr`, `cn` | 한국/중국 소스일 때 |
| 소스 이름 | `reddit`, `hn`, `arxiv`, `openai`, `nvidia` | 소스 어댑터에서 고정 |
| 서브 소스 | `localllama`, `machinelearning`, `huggingface` | 세부 채널 구분 |
| 콘텐츠 유형 | `blog`, `news`, `paper`, `model`, `repo`, `release` | `doc_type`에서 파생 |

### 7.2 소스별 추가 태그

| 소스 | 추가 태그 예시 | 출처 |
|------|---------------|------|
| arXiv | `cs.AI`, `cs.LG`, `cs.LO` | arXiv 카테고리 |
| HF Models | `text-generation`, `safetensors`, `transformers` | 모델 태그 |
| HF Trending | `vision`, `diffusion-models`, `text-generation` | 모델 태그 |
| Reddit | `Discussion`, `Research`, `News` | 포스트 flair |
| GitHub | `license:mit`, `python`, `hacktoberfest` | repo 토픽/라이선스 |
| LMArena | `leaderboard` | 고정 |

### 7.3 현재 수집된 고유 태그 (전체)

```
# 카테고리/유형
benchmark, blog, community, company, daily_papers, leaderboard, model, news,
paper, release, repo, story, trending

# 지역
cn, kr

# 소스/조직
amazon, anthropic, apple, arxiv, bytedance, deepmind, deepseek, github,
google, groq, hn, huggingface, kakao, lgai, localllama, lmarena,
machinelearning, microsoft, mindspore, mistral, naver, nvidia, openai,
paddlepaddle, qwen, reddit, salesforce, samsung, stability, tencent, upstage

# 기술/주제 (소스에서 가져온 원본 태그)
3d, 3d-aigc, agent, audio, code, conversational, deep-learning, diffusion-models,
gemma, glm, image_edit, image_to_video, llm, machine-learning, ocr,
natural-language-processing, safetensors, search, shape-generation,
software-engineering, text-generation, text-generation-inference,
text_to_image, text_to_video, transformers, vision, ...

# arXiv 카테고리
cs.AI, cs.LG, cs.LO, cs.SC
```

---

## 8. LLM Enrichment 결과

<!-- ────────────────────────────────────────────
     documents.ndjson 자체에는 llm placeholder만 있다.
     실제 enrichment 결과는 별도 NDJSON 파일에 저장된다.
     document_id로 join해서 사용한다.
     ──────────────────────────────────────────── -->

### 8.1 documents.ndjson 내 `llm` 블록

모든 문서에 `llm` 블록이 포함되며, Enrichment 전에는 아래 상태로 초기화된다.

```json
{
  "llm": {
    "status": "pending",
    "run_meta": {}
  }
}
```

### 8.2 현재 구현된 Enrichment 출력 (별도 파일)

Enrichment 결과는 `documents.ndjson`을 수정하지 않고, `enriched/` 디렉토리에 별도 NDJSON로 저장된다.
프론트엔드는 `document_id`를 키로 join해서 사용한다.

**Company filter** → `enriched/document_filters.ndjson`

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
  "generated_at": "2026-03-24T12:00:00Z"
}
```

**Paper domain** → `enriched/paper_domains.ndjson`

```json
{
  "document_id": "arxiv_rss_cs_ai:2603.19429",
  "filter_scope": "paper_panel",
  "paper_domain": "agents",
  "model_name": "qwen3.5:4b",
  "runtime": "ollama",
  "prompt_version": "paper_domain_v1",
  "schema_version": "paper_domain_v1",
  "generated_at": "2026-03-24T12:00:00Z"
}
```

상세 enum 정의와 활용 방법은 [04. LLM Usage](../04_llm_usage.md) 를 참조한다.

---

## 9. 소스별 필드 커버리지 요약

각 소스가 어떤 필드를 채우는지 한눈에 파악하기 위한 매트릭스.

| 소스 | author | body | engagement | discovery | external_ids | related_urls |
|------|--------|------|------------|-----------|-------------|-------------|
| arXiv | ✓ | abstract | ✗ | freshness only | arxiv_id | ✗ |
| HF Daily Papers | ✓ | abstract | comments | freshness only | ✗ | ✗ |
| HF Models Likes | ✗ | metadata | likes, downloads | popularity + freshness | hf_model_id | ✗ |
| HF Models New | ✗ | metadata | likes, downloads | **newness 중심** | hf_model_id | ✗ |
| HF Trending Models | ✓ | metadata | likes, downloads | **spark/trending 중심** | hf_model_id | ✗ |
| HN | ✗ | empty | score, comments | hn_id | ✗ |
| Reddit | ✓ | full_text | score, comments, upvote_ratio | reddit_id | ✗ |
| GitHub Repos | ✗ | metadata | stars, forks, watchers | github_repo_id | ✗ |
| GitHub Releases | ✗ | full_text | assets | ✗ | ✗ |
| OpenAI/Google/MS/NVIDIA 등 (RSS) | ✓ | full_text | ✗ | feed_entry_id | ✗ |
| Anthropic/DeepMind 등 (Scrape) | ✓ | full_text/excerpt | ✗ | ✗ | hero_image 등 |
| Samsung Research | ✓ | excerpt | ✗ | ✗ | thumbnail |
| LG AI Research Blog | ✓ | full_text | read_count | ✗ | image/VOD |
| LMArena | ✗ | generated_panel | votes, rating, rank | ✗ | ✗ |
| Open LLM Leaderboard | ✗ | metric_summary | ✗ | ✗ | ✗ |
