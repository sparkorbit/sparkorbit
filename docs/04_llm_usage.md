[Index](./README.md) · [01. Overall Flow](./01_overall_flow.md) · [02. Sections](./02_sections/README.md) · [02.1 Sources](./02_sections/02_1_sources.md) · [03. Runtime Flow Draft](./03_runtime_flow_draft.md) · **04. LLM Usage** · [05. Data Collection Pipeline](./05_data_collection_pipeline.md)

---

# AI/Tech World Monitor - LLM Usage

> Target design, not implemented runtime
> `docs/01_overall_flow.md`, `docs/02_sections/02_1_sources.md`, `docs/03_runtime_flow_draft.md`를 바탕으로, domain 요약과 drill-down UI를 만들기 위한 LLM 활용 문서
> 2026-03-23 초안

---

## 0. 이 문서의 목적

이 문서는 **현재 저장소에 구현된 코드 경로를 설명하는 문서가 아니다.**
현재 구현된 사실 기준은 [05. Data Collection Pipeline](./05_data_collection_pipeline.md) 이고, 이 문서는 그 위에 얹을 target enrichment/runtime 설계를 적는다.

World Monitor는 **Open World Agents 안에서 동작하는 요약/탐색 레이어**다. 사용자는 단순히 카드 몇 개를 읽는 것이 아니라, 여러 패널에서 정보를 훑고, 요약을 누르고, 관련 문서를 펼치고, 필요하면 agent에게 추가 질문을 던질 수 있어야 한다.

World Monitor에서 원하는 UX는 아래와 같다.

1. 홈 화면에서 domain별 요약 카드가 보인다
2. 요약 카드를 누르면 해당 domain의 topic/event summary가 열린다
3. event summary를 누르면 연결된 문서, chunk, 링크, 메타데이터가 DB에서 펼쳐진다
4. 사용자는 `domain -> event -> original document` 순서로 drill-down할 수 있다

이 구조는 충분히 가능하다. 핵심은 LLM이 원문을 대체하는 것이 아니라, **원문 위에 얹히는 요약/정리 레이어**로 동작하도록 저장 구조를 설계하는 것이다.

---

## 1. 목표 UX

| 화면 | 사용자에게 보이는 것 | 실제 뒤에서 읽는 데이터 |
|------|----------------------|--------------------------|
| **Home** | domain별 headline, 짧은 요약, 건수, 변화량 | `domain_digests`, `topic_clusters` 집계 |
| **Domain View** | domain 설명, 주요 event 5~20개, 관련 태그 | `cluster_summaries`, `cluster_members` |
| **Event View** | "무슨 일이 있었는가", 핵심 포인트, 관련 문서 목록 | `cluster_summaries`, `document_summaries`, `summary_evidence` |
| **Document View** | 원문 제목, 링크, 짧은 요약, chunk 단위 evidence | `documents`, `document_chunks`, `document_summaries` |
| **Ask Panel (선택)** | "이 이슈 왜 중요해?" 같은 follow-up 답변 | 위 레이어들을 retrieval해서 LLM 질의응답 |

가장 중요한 점은 클릭할수록 **LLM 결과물만 보여주는 것이 아니라**, 그 결과물과 연결된 근거 문서들이 함께 보여야 한다는 점이다.

또 하나의 원칙은 **source feed를 먼저 섞지 않는 것**이다. Reddit, HN, arXiv, 기업 채널, GitHub 같은 원문 레이어는 source별로 따로 보여주고, 여러 source를 하나의 사건으로 묶는 일은 summary / cluster 단계에서만 수행하는 편이 더 안전하다.

### 패널 구성

| 패널 | 역할 | 주로 보여주는 것 |
|------|------|------------------|
| **Summary Panel** | 전체 흐름을 빠르게 이해 | domain digest, top event headline |
| **SNS / Community Panel** | 지금 반응이 어디에 몰리는지 파악 | Reddit/HN/공개 커뮤니티 포스트 |
| **Paper Panel** | 연구 변화 추적 | arXiv/HF papers, paper summary |
| **Company / Release Panel** | 기업 발표와 제품 변화 추적 | news, release notes, changelog |
| **Open Source Panel** | repo/release 변화 추적 | GitHub repo, releases, OSS 요약 |
| **Benchmark Panel** | 모델 비교와 평가 변화 확인 | leaderboard, benchmark summary |
| **Ask Agent Panel** | follow-up 질문 | 현재 열린 요약/문서 기반 grounded answer |

---

## 2. 정보 계층

LLM 레이어는 아래 4단으로 나누는 것이 가장 안정적이다.

1. **Document Summary**
   소스 문서 1개에 대한 grounded summary
2. **Event / Topic Summary**
   서로 관련된 문서들을 묶은 cluster 요약
3. **Domain Digest**
   하나의 domain 안에서 일정 시간창(`24h`, `7d`) 기준 top event를 요약
4. **Global Digest**
   전체 화면에서 보여줄 AI/Tech 전체 headline 요약

이 계층을 쓰면 한 번 만든 document summary를 여러 cluster/domain 요약에 재활용할 수 있다.

---

## 3. LLM이 맡을 수 있는 일

### 3-1. 분류

| 작업 | 입력 | 출력 |
|------|------|------|
| **primary domain 분류** | 제목, 본문, source metadata | `research`, `models`, `opensource`, `company`, `community`, `benchmark`, `infra`, `policy` 등 |
| **subdomain 분류** | 본문 + tags | `agents`, `multimodal`, `video`, `reasoning`, `safety`, `robotics` 등 |
| **content type 분류** | title + source | `paper`, `repo`, `release_note`, `news`, `benchmark_update`, `post` |
| **importance score** | 문서 내용 + source + discovery + engagement | 0~100 score와 한 줄 이유 |
| **panel fit 분류** | title + body excerpt + source metadata | `keep`, `drop`, `needs_review` |

### 3-2. 추출

| 작업 | 출력 예시 |
|------|-----------|
| **entity extraction** | 사람, 회사, 모델명, 논문명, repo명 |
| **claim extraction** | "어떤 주장이 나왔는지" |
| **risk / caveat extraction** | benchmark caveat, 제한사항, 보안/정책 리스크 |
| **canonical title 생성** | 홈 화면용 짧은 제목 |

### 3-3. 요약

| 작업 | 설명 |
|------|------|
| **document summary** | 문서 1개를 1줄/짧은 요약/핵심 bullet로 압축 |
| **event summary** | 같은 이슈를 다룬 문서 여러 개를 묶어서 "무슨 일이 있었나" 정리 |
| **domain digest** | 한 domain에서 지금 봐야 할 변화만 압축 |
| **global digest** | 여러 domain을 가로지르는 top headline 생성 |

### 3-4. 서빙 보조

| 작업 | 설명 |
|------|------|
| **query-time QA** | 사용자가 domain이나 event 안에서 후속 질문을 던졌을 때 응답 |
| **related item 추천** | 비슷한 이슈나 이전 이벤트 연결 |
| **display text rewrite** | 카드 제목을 짧고 읽기 쉽게 정리 |

### 3-5. Company / Release Panel 전용 필터

Company 계열 source는 noise가 많다. 제품/모델/API 릴리즈와 직접 연결된 글도 있지만, 행사 후기, 채용, 교육, 논문 소개, 학회 참관기 같은 글도 섞인다. 따라서 Company / Release panel은 summary 전에 한 번 더 **panel-fit filter**를 거치는 편이 안전하다.

이 단계는 retrieval이나 RAG가 필요한 작업이 아니다. 이 문서에서 필요한 것은 "이 문서가 company panel에 들어갈 가치가 있는가"에 대한 **bounded classification** 이므로, title, 본문 일부, source metadata만으로도 instruction-only 분류가 가능하다.

#### 필터 대상

- `company`
- `company_kr`
- `company_cn`

#### keep 기준

- 모델 공개, 모델 업데이트, 모델 성능 변화
- API / SDK / 제품 릴리즈
- changelog, release note, pricing / policy / availability 변경
- benchmark / eval 결과 공개
- 주요 오픈소스 공개
- 기업이 직접 발표한 중요한 연구 성과 또는 deployment 사례

#### drop 기준

- 학회 참석 후기, conference recap, 행사 스케치
- 논문 소개, survey, 리뷰성 글
- 교육 프로그램, 아카데미, 캠프, 세미나 안내
- 채용, recruiting, hiring, culture / interview / PR 글
- 회사 일반 홍보, 파트너십 소개, 조직 뉴스
- company panel에서 바로 보여줄 필요가 낮은 long-form thought piece

#### 권장 출력 스키마

```json
{
  "document_id": "doc_123",
  "filter_scope": "company_panel",
  "decision": "keep",
  "section": "company_release",
  "reason": "모델 릴리즈와 성능 변화가 직접적으로 포함되어 있다.",
  "confidence": 0.93
}
```

`section`은 최소한 아래 정도로 고정하면 충분하다.

- `company_release`
- `company_research`
- `ignore`

#### Batch Chunk 전략

source item 하나당 LLM inference를 1번씩 수행하면 비용이 너무 커진다. 따라서 company filter는 문서 1개 단위 호출이 아니라 **item chunk 단위 batch classification** 으로 처리하는 편이 낫다.

여기서 말하는 chunk는 document embedding을 위한 본문 chunk와 다르다. 이 단계의 chunk는 **여러 문서를 한 번에 모델에 넣는 inference batch chunk** 다.

권장 방식은 아래와 같다.

1. `company*` 계열 normalized document만 모은다.
2. 각 문서에서 `document_id`, `source`, `title`, `published_at`, `tags`, `body_excerpt`만 뽑는다.
3. 이 문서들을 `10~30개` 정도의 item chunk로 나눠 한 번에 분류한다.
4. 모델은 item별로 `decision`, `section`, `reason`, `confidence`를 JSON 배열로 반환한다.
5. `keep`만 company feed와 downstream summary 대상으로 넘긴다.
6. `drop`은 raw/doc에는 남기되 UI와 summary 대상에서는 제외한다.
7. `needs_review` 또는 confidence가 낮은 item만 2차 개별 호출로 재판정한다.

이 방식의 장점은 다음과 같다.

- RAG 없이도 충분히 높은 precision을 기대할 수 있다.
- source를 삭제하지 않고도 panel 품질을 관리할 수 있다.
- summary 전에 불필요한 문서를 줄여 LLM 비용을 낮출 수 있다.
- 규칙이 바뀌어도 raw/doc를 기준으로 재판정이 가능하다

---

## 4. 권장 파이프라인

### 4-1. 비용 모델: 로컬 LLM (GPU)

모든 LLM 호출은 **로컬 GPU에서 구동하는 Qwen 3.5 계열**을 사용한다. API 비용은 0이다.

- 기본 모델: `Qwen/Qwen3.5-8B` (분류, 요약, 필터)
- 고품질 모델: `Qwen/Qwen3.5-14B` (cluster summary, domain digest)
- 구동: Ollama 또는 vLLM
- GPU 기준 처리량: ~100+ tok/s (8B), 문서 1개 요약 ~0.3초

### 4-2. 파이프라인 단계

```
수집 → 정규화 → discovery/engagement 필터 → title 키워드 클러스터링 → 섹션별 배치 LLM → 서빙
                                             (LLM 불필요)              (섹션당 1회)
```

1. **수집**
   RSS/API/scrape로 raw 문서를 모은다.
2. **정규화**
   source별 데이터를 공통 `documents` 스키마로 맞춘다.
3. **1차 rule-based tagging**
   source, category, URL pattern, repo/paper ID로 빠른 기본 태깅을 한다.
4. **discovery / engagement 필터**
   단순 누적 인기만 보지 않고, `새로 생겼는가`, `지금 반짝이는가`, `기본 인기/안정성이 있는가`를 함께 본다. 특히 모델 섹션은 `hf_models_new + hf_trending_models + hf_models_likes`를 같이 보고, selection은 discovery 우선으로 잡는다. 이 단계에서 화면 정렬용 `ranking.feed_score`도 같이 계산해 상단에는 새롭고 핫한 정보를, 하단에는 이전 정보를 배치한다.
5. **title 키워드 클러스터링 (LLM 불필요)**
   title에서 키워드(모델명, 회사명, 기술명 등)를 추출하고, 같은 키워드를 공유하는 문서끼리 묶는다. 이 단계는 규칙 기반이며 밀리초 단위로 처리된다. embedding이나 벡터 DB는 사용하지 않는다.
6. **Company panel filter**
   `company`, `company_kr`, `company_cn` 문서에 대해 instruction-only keep/drop 분류를 수행한다. item chunk 단위 batch inference로 처리한다.
7. **섹션별 배치 LLM 호출 (in-context learning)**
   섹션(Papers, Community, Company, OSS, Benchmark 등)별로 `ranking.feed_score` 기준 상위 문서 N개를 모아 **LLM 1회 호출**로 처리한다.
   - 프롬프트: instruction + few-shot 예시가 미리 세팅된 prompt pack
   - 입력: 해당 섹션의 문서들 (title + body excerpt + discovery + engagement metadata)
   - 출력: 구조화된 JSON (Level 1 한 줄 요약 + Level 2 상세 요약 + 레퍼런스 매핑)
   - 호출 횟수: **~6-7회** (섹션 수만큼, 문서 수가 아님)
   - 소요 시간: GPU 기준 섹션당 2-3초, **전체 ~15-20초**
8. **서빙 (3단계 드릴다운)**
   - **Level 1 (홈)**: 섹션별 핫 토픽 한 줄씩 표시
   - **Level 2 (상세)**: 클릭 시 관련 소스들의 상세 요약 + 원본 레퍼런스 목록
   - **Level 3 (원본)**: 클릭 시 원본 기사/페이지로 이동

### 4-3. 이전 파이프라인과의 차이

| 항목 | 이전 (문서 단위) | 현재 (섹션 배치) |
|------|-----------------|-----------------|
| LLM 호출 횟수 | ~100회 (문서당 1회) | **~7회** (섹션당 1회) |
| 클러스터링 | embedding similarity | **title 키워드 매칭** (LLM 불필요) |
| 도메인 분류 | LLM classification | **source→도메인 매핑 테이블** (LLM 불필요) |
| 비용 | API 기준 ~$0.03/일 | **$0 (로컬 GPU)** |
| 처리 시간 | API latency 의존 | **~15-20초 (GPU)** |
| 벡터 DB / RAG | chunking + embedding 필요 | **불필요** (문서 누적 수만 개 전까지) |

핵심 변경: 도메인 분류와 클러스터링을 LLM에서 규칙 기반으로 내렸고, LLM은 **요약 생성에만 집중**한다. 호출 단위도 문서→섹션으로 올려서 횟수를 대폭 줄였다.

### 4-4. 데이터 처리 예시 (실제 수집 데이터 기반)

아래는 `2026-03-23` 수집 데이터(69개 문서, 소스당 3개 limit)를 기준으로 파이프라인이 어떻게 동작하는지 보여주는 예시다.

#### Step 1: 수집 + 정규화 결과

```
총 69개 문서 (36개 소스 × limit 3)
실운영 시 ~400개/일 예상
```

#### Step 2: discovery / engagement 필터

source별 새로움(discovery)과 engagement 지표를 같이 보고 문서를 선별한다.

```
[hn_topstories]  score=620, comments=288  "PC Gamer recommends RSS readers..."     ✓ 통과
[hn_topstories]  score=113, comments=26   "POSSE – Publish on your Own Site..."    ✓ 통과
[hn_topstories]  score=59,  comments=34   "Walmart: ChatGPT checkout converted..." ✓ 통과

[reddit_localllama]  score=180  "I came from Data Engineering stuff..."            ✓ 통과
[reddit_localllama]  score=164  "So cursor admits Kimi K2.5 is the best..."        ✓ 통과
[reddit_localllama]  score=137  "Announcing LocalLlama discord server..."          ✗ 제외 (공지성)

[hf_models_new]       age=0.2h   "vadimbelsky/qwen3.5-medical-ft-stage3-dpo-lora" ✓ 통과
[hf_trending_models]  likes=1062 "Qwen3.5-27B-Claude-4.6-Opus-Reasoning..."       ✓ 통과
[hf_trending_models]  likes=821  "Qwen3.5-35B-A3B-Uncensored-HauhauCS..."         ✓ 통과
[hf_models_likes]     likes=13100 "deepseek-ai/DeepSeek-R1"                       ✓ 통과

[arxiv_rss_cs_ai]     engagement 없음 → 전부 통과 (논문은 필터 안 함)
[openai_news_rss]     engagement 없음 → 전부 통과 (기업 발표는 필터 안 함)
...
```

engagement가 없는 소스(논문, 기업 블로그, 벤치마크)는 **전부 통과**시킨다. 커뮤니티는 노이즈 제거, 모델은 discovery 우선 정렬이 핵심이다.

#### Step 3: title 키워드 클러스터링 (LLM 불필요)

title에서 키워드를 추출하고, 같은 키워드를 공유하는 문서끼리 묶는다.

```python
# 규칙 기반 — 밀리초 단위로 처리
keywords_extracted = {
    "Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled"  → ["qwen", "reasoning"]
    "Qwen3.5-35B-A3B-Uncensored-HauhauCS-Aggressive"   → ["qwen"]
    "Qwen3Guard: Real-time Safety for Your Token Stream" → ["qwen"]
    "Qwen-Image-Edit: Image Editing with Higher Quality" → ["qwen"]
    "Qwen-Image: Crafting with Native Text Rendering"    → ["qwen"]
}
```

결과:

```
클러스터 "qwen" (5개 문서)
├── [hf_trending_models] Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled   likes=1062
├── [hf_trending_models] Qwen3.5-35B-A3B-Uncensored-HauhauCS-Aggressive    likes=821
├── [qwen_blog_rss]      Qwen3Guard: Real-time Safety for Your Token Stream
├── [qwen_blog_rss]      Qwen-Image-Edit: Image Editing with Higher Quality
└── [qwen_blog_rss]      Qwen-Image: Crafting with Native Text Rendering

클러스터 "agent" (10개 문서)
├── [amazon_science]     How agentic AI helps heal the systems we can't replace
├── [arxiv_rss_cs_ai]    Hyperagents
├── [lg_ai_research_blog] A Design Guide for Organizations Implementing Agentic AI
├── [microsoft_research] Systematic debugging for AI agents: AgentRx framework
├── [microsoft_research] PlugMem: Transforming raw agent interactions into knowledge
├── [openai_news_rss]    How we monitor internal coding agents for misalignment
├── [salesforce_ai_research_rss] Poisoning the Well: Search Agents Get Tricked...
└── ...

클러스터 "nvidia" (3개 문서)
├── [nvidia_deep_learning] NVIDIA Rubin Platform, Open Models, Autonomous Driving
├── [nvidia_deep_learning] As AI Grows More Complex, Model Builders Rely on NVIDIA
└── [nvidia_deep_learning] Reaching Across the Isles: UK-LLM Brings AI to UK Languages

클러스터 "reasoning" (3개 문서)
├── [apple_ml]           Goldilocks RL: Tuning Task Difficulty to Escape Sparse Rewards
├── [hf_trending_models] Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled
└── [microsoft_research] Phi-4-reasoning-vision and the lessons of training...

(단독 문서는 클러스터 없이 섹션에 개별 표시)
```

#### Step 4: 섹션별 배치 LLM 호출

소스→섹션 매핑 테이블로 문서를 섹션에 배치하고, 섹션당 LLM 1회 호출한다.

```
섹션 "Community" → hn_topstories, reddit_localllama, reddit_machinelearning
섹션 "Papers"    → arxiv_rss_cs_ai, arxiv_rss_cs_lg, hf_daily_papers
섹션 "Company"   → openai_news_rss, qwen_blog_rss, nvidia_deep_learning, ...
섹션 "Models"    → hf_models_new, hf_trending_models, hf_models_likes
섹션 "OSS"       → hf_blog, github_curated_repos
섹션 "Benchmark" → lmarena_overview, open_llm_leaderboard
```

**예시: "Models" 섹션 LLM 호출**

입력 프롬프트:

```
[System] 당신은 AI/Tech 트렌드 요약 전문가입니다.
아래 문서들을 읽고, 핫 토픽별로 Level 1 한 줄 요약과 Level 2 상세 요약을 생성하세요.

[Few-shot 예시]
입력: { "title": "Meta releases Llama 4 Scout", "source": "hf_trending_models", ... }
출력: { "topic": "Llama 4 Scout 공개", "level1": "Meta, Llama 4 Scout 공개 — MoE 기반 10B 활성 파라미터로 효율성 강조", ... }

[문서 목록]
1. { "title": "vadimbelsky/qwen3.5-medical-ft-stage3-dpo-lora", "source": "hf_models_new", "age_hours": 0.2, "spark_score": 94 }
2. { "title": "Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled", "source": "hf_trending_models", "likes": 1062, "downloads": 151482, "spark_score": 88 }
3. { "title": "Qwen3.5-35B-A3B-Uncensored-HauhauCS-Aggressive", "source": "hf_trending_models", "likes": 821, "downloads": 299865, "spark_score": 84 }
4. { "title": "deepseek-ai/DeepSeek-R1", "source": "hf_models_likes", "likes": 13100, "downloads": 1649989, "spark_score": 42 }
5. { "title": "black-forest-labs/FLUX.1-dev", "source": "hf_models_likes", "likes": 12497, "downloads": 783227, "spark_score": 38 }
```

LLM 출력 (구조화된 JSON):

```json
{
  "section": "models",
  "topics": [
    {
      "topic_id": "qwen35_distilled",
      "level1": "방금 올라온 Qwen 파생 모델과 트렌딩 변형이 동시에 급부상",
      "level2": {
        "summary": "새로 생성된 Qwen 3.5 파생 모델이 바로 관측됐고, 동시에 기존 커뮤니티 변형 두 개가 트렌딩 상위권에 올랐다. 즉 단순 장기 인기보다 '지금 막 생기고 바로 퍼지는' 움직임이 강하게 보인다.",
        "references": [
          { "doc_idx": 1, "source": "hf_models_new", "note": "created < 1h — spark_score 94" },
          { "doc_idx": 2, "source": "hf_trending_models", "note": "Reasoning Distilled 27B — likes 1,062" },
          { "doc_idx": 3, "source": "hf_trending_models", "note": "Uncensored 35B — downloads 299K" }
        ]
      }
    },
    {
      "topic_id": "deepseek_r1_steady",
      "level1": "DeepSeek-R1, likes 13,100으로 HuggingFace 전체 1위 유지",
      "level2": {
        "summary": "DeepSeek-R1이 HuggingFace에서 likes 기준 1위를 유지하고 있다. 다운로드 164만 건으로 추론 특화 모델에 대한 수요가 여전히 강하다.",
        "references": [
          { "doc_idx": 3, "source": "hf_models_likes", "note": "likes 13,100 / downloads 1.6M" }
        ]
      }
    },
    {
      "topic_id": "image_gen_models",
      "level1": "이미지 생성 모델 FLUX.1-dev와 SDXL, 다운로드 합산 290만 건으로 꾸준한 인기",
      "level2": {
        "summary": "FLUX.1-dev(likes 12,497)와 Stable Diffusion XL(downloads 213만)이 이미지 생성 분야에서 여전히 강세다.",
        "references": [
          { "doc_idx": 4, "source": "hf_models_likes", "note": "FLUX.1-dev — likes 12,497" },
          { "doc_idx": 5, "source": "hf_models_likes", "note": "SDXL — downloads 2.1M" }
        ]
      }
    }
  ]
}
```

#### Step 5: 서빙 (3단계 드릴다운)

위 LLM 출력이 그대로 UI에 매핑된다.

```
┌─────────────────────────────────────────────────────────┐
│ 🔥 Models                                               │
│                                                         │
│  • Qwen 3.5 기반 커뮤니티 파생 모델 급증               │ ← Level 1
│    — Reasoning Distilled 버전 다운로드 15만 돌파        │
│                                                         │
│  • DeepSeek-R1, likes 13,100으로 HF 전체 1위 유지      │ ← Level 1
│                                                         │
│  • 이미지 생성 모델 FLUX.1-dev와 SDXL, 합산 290만 DL   │ ← Level 1
└─────────────────────────────────────────────────────────┘
                          ↓ 클릭: "Qwen 3.5 기반..."
┌─────────────────────────────────────────────────────────┐
│ Qwen 3.5 기반 커뮤니티 파생 모델 급증                   │
│                                                         │
│ Qwen 3.5를 기반으로 한 커뮤니티 파생 모델이 빠르게      │ ← Level 2
│ 확산 중이다. Claude 4.6 Opus의 추론 능력을 증류한       │    상세 요약
│ 27B 모델이 likes 1,062를 기록했고...                    │
│                                                         │
│ References:                                             │
│  📄 Qwen3.5-27B-Claude-Reasoning-Distilled  [HF ↗]    │ ← 레퍼런스
│     likes 1,062 · downloads 151K                        │
│  📄 Qwen3.5-35B-Uncensored-HauhauCS        [HF ↗]    │
│     likes 821 · downloads 299K                          │
└─────────────────────────────────────────────────────────┘
                          ↓ 클릭: [HF ↗]
              → huggingface.co/Jackrong/Qwen3.5-...        ← Level 3 원본
```

#### 전체 처리 시간 예상 (GPU)

```
Step 2  discovery 필터      ~10ms   (메모리 내 비교)
Step 3  키워드 클러스터링    ~50ms   (title 문자열 매칭)
Step 4  LLM 6-7회 호출      ~15-20s (섹션당 2-3초, GPU)
────────────────────────────────────────
합계                         ~20초
```

---

## 5. DB에 어떻게 연결할까

현재 runtime draft의 enrichment 레이어를 확장해서 아래 엔터티를 두는 것을 권장한다.

| 테이블 | 역할 |
|--------|------|
| `document_filters` | panel 적합 여부와 제외 사유 기록 |
| `document_summaries` | 문서 1개 단위 요약 결과 |
| `topic_clusters` | 같은 이벤트/주제를 묶는 cluster 헤더 |
| `cluster_members` | cluster와 document의 연결 테이블 |
| `cluster_summaries` | cluster 단위 대표 요약 |
| `domain_digests` | domain 단위 일정 시간창 요약 |
| `summary_evidence` | summary와 chunk/doc 사이의 근거 연결 |
| `llm_runs` | 어떤 모델/프롬프트/설정으로 생성했는지 기록 |

### 최소 필드 제안

#### `document_filters`

```json
{
  "document_id": "doc_123",
  "filter_scope": "company_panel",
  "decision": "keep",
  "section": "company_release",
  "reason": "제품/API 릴리즈 성격이 강하고 panel 목적과 직접 연결된다.",
  "confidence": 0.93,
  "model_name": "Qwen/Qwen3-8B",
  "prompt_version": "company_filter_v1",
  "generated_at": "2026-03-23T07:00:00Z"
}
```

#### `document_summaries`

```json
{
  "document_id": "doc_123",
  "summary_1l": "OpenAI가 새로운 추론 최적화 모델을 공개했다.",
  "summary_short": "새 모델의 핵심 변화와 배포 범위를 3문장 안으로 요약",
  "key_points": ["포인트 1", "포인트 2"],
  "entities": ["OpenAI", "o3-mini"],
  "primary_domain": "models",
  "subdomains": ["reasoning"],
  "importance_score": 88,
  "evidence_chunk_ids": ["chunk_1", "chunk_4"],
  "model_name": "Qwen/Qwen3-8B",
  "prompt_version": "doc_summary_v1",
  "generated_at": "2026-03-23T07:00:00Z"
}
```

#### `cluster_summaries`

```json
{
  "cluster_id": "cluster_456",
  "cluster_title": "Qwen3 계열 공개와 추론 모드 전환 기능이 화제",
  "what_happened": "관련 문서들을 합쳐 3~5문장으로 정리한 본문",
  "why_it_matters": "왜 중요한지 한 문단",
  "representative_doc_ids": ["doc_12", "doc_19", "doc_25"],
  "evidence_chunk_ids": ["chunk_20", "chunk_44"],
  "model_name": "Qwen/Qwen3-14B",
  "prompt_version": "cluster_summary_v1"
}
```

#### `domain_digests`

```json
{
  "domain": "models",
  "window": "24h",
  "headline": "오늘은 오픈모델 공개와 벤치마크 비교가 핵심 이슈였다.",
  "overview": "도메인 전체를 4~6문장으로 압축",
  "top_cluster_ids": ["cluster_456", "cluster_461", "cluster_488"],
  "watchouts": ["평가 방식이 서로 다름", "벤치마크 수치 해석 주의"],
  "model_name": "Qwen/Qwen3-14B",
  "prompt_version": "domain_digest_v1"
}
```

### 클릭 시 DB 조회 흐름

1. 홈 화면에서 domain card를 그릴 때 `domain_digests`를 읽는다
2. domain을 누르면 `top_cluster_ids`로 `cluster_summaries`를 불러온다
3. event를 누르면 `cluster_members`를 통해 관련 `documents`와 `document_summaries`를 가져온다
4. 근거를 누르면 `summary_evidence`를 통해 관련 chunk를 보여준다

이렇게 하면 "요약 글을 누르면 관련된 DB들이 펼쳐지는" 형태를 자연스럽게 만들 수 있다.

여기서 `cluster_members`는 source 레이어를 지우는 것이 아니라, **여러 source의 관련 문서를 summary 아래에 모아 보여주는 용도**다. 따라서 event view 안에는 비슷한 내용을 다루는 링크가 source별로 함께 보일 수 있다.

### Reference 노출 원칙

1. 모든 summary card에는 최소 1개 이상의 `representative_doc_id`가 연결되어야 한다
2. event view에서는 항상 실제 `source`, `원문 URL`, `짧은 요약`, `세부 요약`을 같이 보여준다
3. detailed summary는 원문을 덮어쓰는 용도가 아니라, 사용자가 reference를 읽기 전에 빠르게 맥락을 잡도록 돕는 레이어다
4. 사용자가 원하면 언제든 원문 링크를 바로 열 수 있어야 한다
5. Ask Agent 응답에도 가능하면 관련 `reference doc`를 함께 노출한다
6. 여러 source의 유사 링크가 함께 보여도 괜찮다. 이 레이어의 목적은 dedup보다 `맥락 묶기`에 가깝다

### LLM-Ready Document Contract

LLM 레이어를 안정적으로 붙이려면, source마다 정보량이 다르더라도 **공통 placeholder를 항상 유지하는 document contract** 가 필요하다. 값이 없으면 `null`, 빈 배열, 빈 객체로 두고 shape는 되도록 유지하는 편이 낫다.

현재 PoC 기준으로 normalized document는 아래 필드를 우선 공통으로 가진다고 가정한다.

| 필드 | 의미 | 비어 있을 수 있나 |
|------|------|------------------|
| `document_id` | `source:source_item_id` 형태의 내부 식별자 | 아니오 |
| `source`, `source_category`, `source_method` | source와 수집 방식 | 일부는 가능하지만 가급적 채움 |
| `title` | 카드와 summary의 기본 제목 | 아니오 |
| `url` | 원문 또는 대표 URL | 예 |
| `canonical_url` | 실제 원문/대표 페이지 | 예 |
| `reference_url` | 클릭 시 우선 보여줄 reference URL | 예 |
| `published_at`, `updated_at`, `sort_at` | 시간 정보 | 예 |
| `ranking` | 화면용 live ordering block | 아니오 |
| `time_semantics` | `published`, `updated`, `snapshot`, `submission`, `observed` 등 | 아니오 |
| `doc_type`, `content_type` | 원문 유형과 서빙용 유형 | 아니오 |
| `description` | 짧은 설명/요약용 본문 | 예 |
| `body_text` | 실제 본문이나 본문 대용 텍스트 | 예 |
| `summary_input_text` | LLM 입력용으로 정리된 텍스트 | 아니오 |
| `text_scope` | `full_text`, `abstract`, `excerpt`, `metadata_only`, `metric_summary`, `empty` 등 | 아니오 |
| `author`, `authors` | 작성자 1명 표시와 다중 작성자 보존 | 예 |
| `tags` | source/doc_type/category를 포함한 display keyword | 예 |
| `engagement`, `engagement_primary` | 커뮤니티/benchmark 반응 수치 | 예 |
| `benchmark` | benchmark panel용 요약 block | 예 |
| `external_ids` | `arxiv_id`, `hf_model_id`, `hn_id`, `model_sha` 같은 외부 식별자 | 예 |
| `related_urls` | repo, 썸네일, 토론 링크, detail 링크 등 보조 URL | 예 |
| `reference` | UI에 그대로 쓸 reference block | 아니오 |
| `llm` | 후속 분류/요약 placeholder | 아니오 |
| `raw_ref` | 원본 payload를 다시 찾기 위한 포인터 | 아니오 |

이 contract의 핵심은 다음과 같다.

1. `published_at` 하나만 믿지 않는다. `time_semantics`로 이 시간이 무엇을 뜻하는지 함께 저장한다.
2. `canonical_url`과 `reference_url`을 분리한다. 예를 들어 HN/Reddit는 원문 URL과 토론 URL이 다를 수 있다.
3. `body_text`가 약한 source도 있으므로, LLM 입력은 항상 `summary_input_text`를 우선 사용한다.
4. benchmark나 repo처럼 일반 article이 아닌 source도 `text_scope`, `content_type`, `external_ids`로 meaning을 보존한다.
5. `author`는 없어도 된다. 반대로 `title + displayable URL + time_semantics`는 없으면 안 된다.

### LLM 관점에서 생길 수 있는 문제

source를 많이 붙일수록 LLM은 풍부해지지만, 아래 문제가 같이 생긴다.

1. **시간 의미 혼합**
   `published_at`이 기사 게시일일 수도 있고, repo 갱신일, leaderboard snapshot 시점, submission 시점일 수도 있다. 따라서 정렬/집계는 `sort_at + time_semantics` 기준으로 해석해야 한다.
2. **본문 품질 차이**
   RSS feed나 scrape source는 `body_text`가 거의 없거나 boilerplate만 있을 수 있다. 이런 경우 `summary_input_text`, `description`, `text_scope`를 먼저 보고 요약해야 한다.
3. **원문 URL과 토론 URL 혼합**
   Reddit/HN/GitHub release처럼 “무엇을 읽게 할 것인가”가 source마다 다르다. UI와 Ask Agent는 `reference_url`을 기본 클릭 대상으로 삼는 편이 안전하다.
4. **구조화 데이터와 자유 텍스트 혼합**
   Open LLM Leaderboard, LMArena, GitHub repo는 사실상 구조화된 metric source에 가깝다. 이런 항목은 article처럼 길게 요약하기보다 `metadata + metrics + short explanation` 형태가 더 적절하다.
5. **cluster 충돌**
   비슷한 모델명, 회사명, release note가 반복되면 cluster가 섞일 수 있다. URL, 외부 식별자, source type을 우선 사용하고, embedding 기반 유사도는 그다음에 쓰는 편이 낫다.
6. **engagement / discovery 편향**
   커뮤니티 반응만 보면 paper/company/release 중요도가 묻힐 수 있고, 반대로 새로움만 보면 품질이 낮은 early noise가 과대표현될 수 있다. panel별로 importance 기준을 분리하고 `discovery + engagement + source type`을 함께 보는 편이 안전하다.

실무적으로는 아래 순서를 권장한다.

1. source별 raw/doc는 그대로 유지한다.
2. LLM 분류/요약은 `summary_input_text`, `external_ids`, `reference`, `metadata`를 함께 읽는다.
3. cluster/domain digest를 만들 때만 여러 source를 묶는다.
4. UI에서는 항상 summary와 reference를 같이 보여준다.

### Benchmark Contract

benchmark는 요약 이전에 아래 block을 먼저 고정해두는 편이 좋다.

```json
{
  "benchmark": {
    "kind": "leaderboard_panel",
    "board_id": "lmarena:/leaderboard/text",
    "board_name": "LMArena Text",
    "snapshot_at": "2026-03-20T11:00:00Z",
    "rank": 1,
    "score_label": "Arena rating",
    "score_value": 1502.13,
    "score_unit": "elo_like_rating",
    "votes": 11801,
    "model_name": "claude-opus-4-6-thinking",
    "organization": "Anthropic",
    "total_models": 330,
    "total_votes": 5602397
  }
}
```

LMArena, Open LLM Leaderboard 같은 source는 정보가 매우 압축돼 있으므로, 긴 article summary보다 `benchmark block + metadata + metrics`를 기본 표시 단위로 보는 편이 더 적합하다.

---

## 6. 프롬프트와 in-context learning 사용법

훈련을 하지 않을 계획이라면, 품질은 **prompt pack + few-shot example + schema 고정**에서 대부분 결정된다.

### 6-1. 공통 원칙

1. **taxonomy를 먼저 고정한다**
   domain, subdomain, content type 목록을 먼저 정하고 계속 바꾸지 않는다.
2. **JSON schema를 먼저 고정한다**
   응답 자유도를 줄여야 파이프라인이 안정적이다.
3. **few-shot은 edge case 위주로 넣는다**
   쉬운 예시보다 헷갈리는 예시가 더 중요하다.
4. **negative example도 넣는다**
   "이건 models가 아니라 benchmark다" 같은 반례가 필요하다.
5. **문서 종류별 prompt를 분리한다**
   paper, news, forum post, release note는 분리하는 것이 좋다.

### 6-2. 추천 prompt pack

| prompt pack | 목적 | 주로 쓰는 입력 |
|-------------|------|----------------|
| `company_filter_v1` | company panel keep/drop 판정 | title, source, tags, body excerpt, published_at |
| `doc_classify_v1` | domain/subdomain/content_type 분류 | title, source, body excerpt |
| `doc_summary_v1` | 문서 요약 | title, body chunks, metadata |
| `cluster_summary_v1` | event 묶음 요약 | 대표 문서 요약 + 핵심 chunk |
| `domain_digest_v1` | 홈 화면용 domain digest | top cluster summaries |
| `ask_domain_v1` | 질의응답 | domain digest + cluster summaries + evidence |

### 6-3. few-shot으로 잘 먹는 작업

| 작업 | few-shot 효과 |
|------|---------------|
| **domain 분류** | 매우 큼 |
| **content type 분류** | 매우 큼 |
| **JSON 구조화 출력** | 매우 큼 |
| **문서 1줄 요약** | 큼 |
| **cluster 대표 제목 생성** | 큼 |
| **긴 종합 분석** | 중간 |

즉, 지금 프로젝트에선 few-shot이 특히 잘 맞는다. 분류와 구조화, 짧은 요약은 소형 모델도 꽤 안정적으로 수행한다.

### 6-4. 추천 출력 스키마 예시

#### 분류

```json
{
  "primary_domain": "models",
  "secondary_domains": ["benchmark"],
  "content_type": "release_note",
  "subdomains": ["reasoning", "agents"],
  "entities": ["OpenAI", "o3-mini"],
  "importance_score": 91,
  "importance_reason": "배포 범위가 넓고 여러 후속 기사에 인용될 가능성이 높다.",
  "needs_human_review": false
}
```

#### grounded summary

```json
{
  "summary_1l": "핵심만 1문장",
  "summary_short": "3문장 이하 짧은 요약",
  "key_points": ["핵심 1", "핵심 2", "핵심 3"],
  "watchouts": ["과장되기 쉬운 부분", "비교시 주의점"],
  "evidence_chunk_ids": ["chunk_10", "chunk_14"]
}
```

---

## 7. 추천 모델 운용 방식

훈련 없이 쓸 것이고, 팀원마다 `24GB`급 GPU가 있다고 가정하면 아래처럼 역할을 나누는 것이 좋다.

### 기본 선택

| 모델 | 추천 용도 | 메모 |
|------|-----------|------|
| **Qwen/Qwen3.5-8B** | 섹션별 배치 요약, company filter, JSON 출력 | 기본 운영 모델, 빠름 |
| **Qwen/Qwen3.5-14B** | Level 1 홈 화면 요약, 고품질 배치 | 품질 우선 |
| **google/gemma-3-12b-it** | 이미지 포함 포스트, 멀티모달 확장 | 라이선스 동의 필요 |

### 현재 프로젝트에 가장 잘 맞는 추천

1. **기본 운영 모델**: `Qwen/Qwen3.5-8B` — 섹션별 배치 요약, company filter
2. **홈 화면 digest**: `Qwen/Qwen3.5-14B` — Level 1 한 줄 요약 품질이 중요하므로
3. **이미지/스크린샷까지 볼 때만 추가**: `google/gemma-3-12b-it`

### 왜 이런 배치가 좋은가

1. 섹션별 배치 호출(~7회)이므로 모델 크기를 올려도 총 처리 시간 부담이 적다
2. 홈 화면 한 줄 요약은 사용자가 가장 먼저 보는 텍스트이므로 14B급 품질이 가치 있다
3. 로컬 GPU 구동이므로 모델 교체 비용이 0이다 — 실험 후 더 나은 모델로 교체 가능
4. 훈련 대신 prompt pack + few-shot으로 품질을 관리한다

---

## 8. 추천 운용 규칙

### 8-1. 캐싱

| 규칙 | 이유 |
|------|------|
| document summary는 문서 변경 시에만 재생성 | 비용 절감 |
| cluster summary는 cluster 멤버가 바뀔 때만 재생성 | 불필요한 재요약 방지 |
| domain digest는 `15~60분` 단위 재생성 | 홈 화면 freshness 유지 |

### 8-2. grounding

1. summary에는 항상 `evidence_chunk_ids`를 저장한다
2. summary만 저장하지 말고 representative document도 같이 저장한다
3. UI에서 원문 링크를 항상 보여준다
4. 근거 chunk를 숨기지 말고 클릭 가능하게 둔다

### 8-3. versioning

반드시 저장해야 하는 필드:

| 필드 | 이유 |
|------|------|
| `model_name` | 모델 교체 시 품질 비교 |
| `prompt_version` | 프롬프트 변경 추적 |
| `fewshot_pack_version` | example pack 변경 추적 |
| `generated_at` | 재생성 시점 추적 |

---

## 9. 추천하지 않는 방식

1. 원문 수백 개를 한 프롬프트에 넣고 한 번에 홈 요약을 만들기
2. summary만 저장하고 어떤 문서에서 나온 말인지 저장하지 않기
3. domain 분류를 entirely free-form text로 두기
4. cluster 생성까지 전부 LLM 한 번에 맡기기
5. 홈 화면이 raw document query에 직접 의존하도록 만들기

특히 1번과 2번은 나중에 디버깅이 거의 불가능해진다.

---

## 10. 구현 순서 제안

| 단계 | 할 일 |
|------|-------|
| **Step 1** | `document_summaries`와 `llm_runs`부터 만든다 |
| **Step 2** | domain/content_type 분류를 JSON schema로 고정한다 |
| **Step 3** | 간단한 cluster 생성 로직을 붙인다 |
| **Step 4** | `cluster_summaries`를 만든다 |
| **Step 5** | `domain_digests`를 만들어 홈 화면과 연결한다 |
| **Step 6** | domain 클릭 -> event 클릭 -> document/evidence drill-down UI를 붙인다 |
| **Step 7** | 마지막에만 Ask Panel 같은 query-time QA를 붙인다 |

해커톤에서는 `Step 1 ~ Step 5`까지만 돼도 world monitor의 핵심 경험은 충분히 나온다.

---

## 11. 바로 써먹을 수 있는 결론

1. 지금 구상한 "domain 요약을 누르면 관련 DB가 펼쳐지는 world monitor"는 충분히 가능하다
2. 구현 포인트는 **요약 레이어와 근거 레이어를 분리하되 연결시키는 것**이다
3. 훈련 없이도 `Qwen3-8B + few-shot + JSON schema`만으로 document 분류와 요약은 충분히 시작할 수 있다
4. 홈 화면 품질은 `cluster summary`와 `domain digest` 품질에 달려 있다
5. 먼저 문서 요약과 cluster 연결부터 만들고, 마지막에 대화형 QA를 얹는 순서가 가장 안전하다

---

## 12. 참고 모델 카드

- [Qwen/Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B)
- [Qwen/Qwen3-14B](https://huggingface.co/Qwen/Qwen3-14B)
- [google/gemma-3-12b-it](https://huggingface.co/google/gemma-3-12b-it)
- [meta-llama/Llama-3.1-8B-Instruct](https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct)
- [mistralai/Mistral-Nemo-Instruct-2407](https://huggingface.co/mistralai/Mistral-Nemo-Instruct-2407)
