[Index](../README.md) · [🇰🇷 한국어](./02_1_sources.ko.md) · [01. Overall Flow](../01_overall_flow.md) · [02. Sections](./README.md) · **02.1 Sources** · [03. Runtime Flow](../03_runtime_flow_draft.md) · [04. LLM Usage](../04_llm_usage.md) · [05. Data Collection Pipeline](../05_data_collection_pipeline.md) · [06. UI Design Guide](../06_ui_design_guide.md)

---

# SparkOrbit Docs - 02.1 Sources

> Canonical source list
> Last verified: 2026-03-27

## Purpose

This is the canonical document for the sources SparkOrbit reads at app startup. It focuses on where signals come from, why each source is kept, and how the product groups them on screen.

Implementation status can differ by source. This page distinguishes between sources that are currently active in the `all-source` run and sources that remain on the watchlist but are excluded because scripted access or URL quality is not stable enough.

## Source Selection Rules

1. The source must be free.
2. Unauthenticated access is preferred.
3. It must be collectible quickly enough to populate the app on startup.
4. Source feeds stay separated by panel.
5. Cross-source event grouping only happens in the summary layer.
6. To preserve drill-down, items or sources without displayable URLs are excluded from the default screen.

## Collection Methods

| Method | Why it matters |
|--------|----------------|
| **RSS / Atom** | The most stable way to get started quickly |
| **REST API** | Easy to consume structured JSON |
| **GraphQL** | Useful when we need selected fields only, but secondary for this MVP |
| **Scrape** | Used only when RSS or APIs are unavailable |

## Hard Exclusion Rules

- Even if `title` exists, the item is excluded from the default feed if `url`, `canonical_url`, and `reference_url` are all empty.
- If a source cannot reliably provide displayable URLs, it is not just lower priority. It becomes an exclusion candidate for the canonical source list.
- `author` is optional, but `title + reference URL + time field` should be preserved whenever possible.
- `tags` act as search and summary keywords, so each source should provide at least minimal source, category, or doc-type-aligned tags.

## Core Source Groups

| Group | Main sources | Notes |
|------|--------------|-------|
| **Papers** | arXiv (cs.AI, cs.LG, cs.CL, cs.CV, cs.RO, cs.IR, cs.CR, stat.ML), Hugging Face daily papers | Research papers |
| **Models** | Hugging Face models (likes/new/trending) | Model cards, kept separate from papers |
| **Community** | Hacker News, Reddit, GitHub | Reaction, popularity, and open-source signals |
| **Company / Release** | OpenAI, Google AI Blog, Microsoft Research, NVIDIA, Apple ML, Amazon Science, Anthropic, DeepMind, Mistral | Company announcements, research, releases |
| **KR Company Additions** | Samsung Research, Kakao Tech, LG AI Research, NAVER Cloud Blog, Upstage | Korean channel coverage |
| **CN Company Additions** | Qwen, DeepSeek, Tencent-Hunyuan, PaddlePaddle, ByteDance, MindSpore | China ecosystem coverage |
| **Benchmarks** | LMArena, Open LLM Leaderboard | Snapshot sources for the benchmark panel |

## 2.1.1 Papers

| Source | Method | Why keep it |
|--------|--------|-------------|
| **arXiv cs.AI** | RSS | General AI papers |
| **arXiv cs.LG** | RSS | General machine learning |
| **arXiv cs.CL** | RSS | NLP and language models |
| **arXiv cs.CV** | RSS | Computer vision |
| **arXiv cs.RO** | RSS | Robotics |
| **arXiv cs.IR** | RSS | Information retrieval |
| **arXiv cs.CR** | RSS | Security, including AI safety-adjacent work |
| **arXiv stat.ML** | RSS | Statistical ML |
| **HF daily_papers** | API | Curated paper lane, highest priority |

## 2.1.1-b Models (split from the paper panel)

| Source | Method | Why keep it |
|--------|--------|-------------|
| **HF models likes** | API | Long-term popularity and baseline reference |
| **HF models new** | API | Detect newly uploaded models |
| **HF trending models** | API | Detect what is surging right now |

## 2.1.2 Community / Developer

| Source | Method | Why keep it |
|--------|--------|-------------|
| **Hacker News** | API | Strong technical community reaction and link-hub behavior |
| **Reddit** | `.json` / optional auth | Tracks subreddit-specific interests and discussion |
| **GitHub** | REST API | Tracks releases, repos, stars, and `updated_at` |

## 2.1.3 Global Company Channels

| Org | Method | Priority note |
|-----|--------|---------------|
| **OpenAI** | RSS | Primary official announcement source |
| **Google AI Blog** | RSS | Primary research-writing source |
| **Microsoft Research** | RSS | Primary research and systems source |
| **NVIDIA** | RSS | Primary AI and deep-learning blog source |
| **Apple ML** | RSS | Primary ML research update source |
| **Amazon Science** | RSS | Primary science and research source |
| **Hugging Face Blog** | RSS | Primary open-ecosystem signal source |
| **Anthropic** | Scrape | Secondary because RSS is unavailable |
| **Google DeepMind** | Scrape | Official blog, but scrape-dependent |
| **Mistral AI** | Scrape | Used for announcement tracking |
| **Stability AI** | Scrape | Secondary because layout changes are riskier |
| **Groq** | Scrape | Secondary because pages are JS-heavy |
| **Salesforce AI Research** | RSS | Enterprise, agent, and eval research channel |

## 2.1.4 Korea Additions

| Org | Method | Why keep it |
|-----|--------|-------------|
| **Samsung Research** | API-like POST JSON | Structured public endpoint looks stable |
| **Kakao Tech** | RSS | Public technical blog |
| **LG AI Research** | API / Page | Keep the blog. Split news into watchlist because public detail URLs are unstable |
| **NAVER Cloud Blog** | RSS | Adds AI and cloud coverage |
| **Upstage** | Scrape | Keeps track of a Korean AI startup channel |

## 2.1.5 China Additions

| Org | Method | Why keep it |
|-----|--------|-------------|
| **Alibaba Qwen** | RSS | GitHub Pages feed makes access stable |
| **DeepSeek** | Docs / Changelog | Good for tracking model and API changes |
| **Tencent-Hunyuan** | GitHub API | Tracks official OSS activity |
| **PaddlePaddle / Baidu** | GitHub API | Major China-based OSS axis |
| **ByteDance** | GitHub API | Tracks influential public repositories |
| **MindSpore / Huawei** | GitHub API | Adds large-enterprise China AI stack coverage |

## 2.1.6 Benchmarks

| Source | Role | Caveat |
|--------|------|--------|
| **LMArena** | Benchmark table and card panel | Secondary because it is scrape-based |
| **Open LLM Leaderboard** | Structured leaderboard snapshot | Based on the Hugging Face datasets API |

### Benchmark Required Fields

Benchmark sources are not treated like regular articles. The fields below are the primary contract.

| Field | Meaning |
|------|---------|
| `benchmark.kind` | `leaderboard_panel`, `leaderboard_model_row`, and similar types |
| `benchmark.board_id` | Unique board identifier |
| `benchmark.board_name` | Human-readable board name |
| `benchmark.snapshot_at` | Snapshot or submission time |
| `benchmark.rank` | Current rank when available |
| `benchmark.score_label` | Score name such as `Arena rating` or `Average ⬆️` |
| `benchmark.score_value` | Primary score value |
| `benchmark.score_unit` | Score unit or interpretation |
| `benchmark.votes` | Votes or participation count per model |
| `benchmark.model_name` | Primary model name |
| `benchmark.organization` | Organization or company |
| `benchmark.total_models` | Total models on the board |
| `benchmark.total_votes` | Total board-level vote count |

For compressed sources such as LMArena, raw information like `top_entries` should also be preserved. The UI should read the `benchmark` block first when rendering cards and tables.

## Currently Excluded / Watchlist

| Source | Why not in current all-source run |
|--------|-----------------------------------|
| **Meta AI** | Excluded from the default all-source run because `https://ai.meta.com/blog/` was unstable under scripted access as of `2026-03-23` |
| **LG AI Research News** | The API exposes body text but not stable public detail URLs, and the public `news/view` route returned `500` as of `2026-03-24` |

## Related Docs

- Redis/session/serving flow: [03. Runtime Flow](../03_runtime_flow_draft.md)
- LLM classification and filtering: [04. LLM Usage](../04_llm_usage.md)
- Normalized field contract: [02.2 Fields](./02_2_fields.md)
