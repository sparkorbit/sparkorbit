[Index](./README.md) · [01. Overall Flow](./01_overall_flow.md) · [02. Sections](./02_sections/README.md) · [03. Runtime Flow](./03_runtime_flow_draft.md) · [04. LLM Usage](./04_llm_usage.md) · [05. Data Collection Pipeline](./05_data_collection_pipeline.md) · **06. UI Design Guide**

---

# SparkOrbit Docs - 06. UI Design Guide

> Canonical UI direction for the current frontend
> Last updated: 2026-03-26

## Purpose

이 문서는 현재 `src/` 아래 React dashboard의 시각 언어와 상태 표현 규칙을 설명한다.

범위:

- console tone과 시각 토큰
- main panel, summary panel, info workspace 구조
- fullscreen loading, reload recovery, SSE 반영 규칙
- settings modal과 layout persistence

범위 밖:

- source 선정
- normalized field contract
- Redis key schema

## Current UI Direction

SparkOrbit의 현재 UI는 futuristic landing page보다 운영 콘솔과 해커톤 대시보드에 가깝게 보이는 것이 맞다.

핵심 방향:

1. 검은 바탕 위에 녹색 계열 정보층을 올린다.
2. 장식보다 정보 밀도와 단계 표현을 우선한다.
3. 카드와 패널은 sharp edge, 얇은 border, dense metadata를 기본으로 한다.
4. 로딩도 단순 spinner가 아니라 운영 상태판처럼 보여야 한다.
5. 패널 재배치와 row height 변경 같은 작업 밀도 조절을 UI 안에서 바로 제공한다.

## Visual Tokens

현재 프로토타입은 아래 토큰을 기본으로 사용한다.

| Token | Value | Usage |
|------|-------|-------|
| `bg` | `#050705` | 앱 전체 바탕 |
| `bg-elevated` | `#0b100b` | 상단 바, settings modal, elevated blocks |
| `panel` | `#0d130d` | 패널 기본 면 |
| `border` | `#2c4129` | 기본 구획선 |
| `border-strong` | `#5a8550` | active, hover, 강조 |
| `text` | `#d6f5d0` | 기본 본문 |
| `muted` | `#a5bba2` | note, hint, 보조 메타 |
| `accent` | `#8dfc54` | 라벨, 진행 상태, 핵심 강조 |
| `accent-dim` | `#75a568` | 약한 강조, source note |

보조 색상은 black/green 범위 안에서 해결한다.

## Typography

| Role | Font |
|------|------|
| 제목, 본문 | `IBM Plex Sans KR` |
| 상태, 수치, 라벨, 메타 | `IBM Plex Mono` |
| Fallback | `Noto Sans KR` |

규칙:

- 섹션 라벨은 mono, uppercase, 넓은 tracking을 사용한다.
- 본문은 작은 크기라도 line-height를 유지한다.
- source, type, status 같은 operational label은 mono badge family로 통일한다.

## Human Readability Contract

사용자에게 보이는 source title, panel title, badge는 internal identifier가 아니라 사람이 바로 읽을 수 있는 이름이어야 한다.

규칙:

1. raw source id를 그대로 노출하지 않는다.
2. `rss`, `api`, `overview`, `cs_ai` 같은 transport/internal token은 UI에 그대로 보이면 안 된다.
3. source feed title은 초보자도 의미를 바로 이해할 수 있는 plain-language 제목을 사용한다.

예시:

- `AI Research Papers`
- `Daily Research Picks`
- `New AI Models`
- `OpenAI Updates`
- `Model Rankings`

금지 예시:

- `Arxiv RSS Cs AI`
- `hf_models_new`
- `openai_news_rss`

## Monitor Sync Rule

monitor에 보이는 내용이 바뀌는 수정은 frontend만 또는 backend만 따로 끝내면 안 된다.

규칙:

1. monitor-visible field, label, action, loading text를 바꾸면 frontend와 backend를 같은 change set에서 같이 갱신한다.
2. backend payload shape가 바뀌면 render component, TS type/content mapping, empty/loading state도 같이 점검한다.
3. frontend 표현을 단순화하거나 제거할 때는 backend의 source title, status text, detail payload도 같은 기준으로 맞춘다.
4. "일단 backend만" 또는 "일단 frontend만" 상태로 monitor contract를 깨진 채 두지 않는다.

## Surface Rules

### Panels

- sharp corner를 유지한다.
- 면 분리는 shadow보다 border와 fill step으로 만든다.
- 패널 기본 구조는 `eyebrow -> title -> session label -> content`다.
- summary panel과 source panel은 같은 primitive를 공유하고, detail panel만 정보량에 맞춰 변형한다.

### Tags And Pills

- 둥근 pill보다 직사각형 badge 느낌을 우선한다.
- source, type, status 같은 operational label은 모두 같은 family에서 파생한다.
- selected 상태는 `border-orbit-accent`로 드러낸다.

### Background

- 전체 배경은 solid black 기반이다.
- 보조 장식은 grid와 scanline 수준까지만 허용한다.
- hero 일러스트나 soft glass 배경은 기본 방향이 아니다.

## Workspace Layout

현재 `PanelWorkspace`는 3개 구역으로 나뉜다.

| Section | Role | Current content |
|--------|------|-----------------|
| `Section 01` | 메인 작업 면 | leaderboard workspace, session header, reload 버튼 |
| `Section 02` | 정보 패널 workspace | source feed panels 또는 digest/document detail override |
| `Section 03` | 하단 요약 면 | category digest summary panel |

추가 규칙:

- `Section 02`는 drag, reorder, row/column span 조절이 가능한 info workspace다.
- panel order와 size는 localStorage에 저장된다.
- detail panel이 열리면 `Section 02` 전체를 override해서 digest detail 또는 document detail을 보여준다.
- settings modal에서 layout reset을 제공해 저장된 배치를 지울 수 있어야 한다.

## Main Panel Rules

메인 패널은 현재 leaderboard workspace를 중심으로 동작한다.

- 헤더에는 세션 라벨과 `reload session` 버튼이 들어간다.
- 본문은 **benchmark board grid**로 동작하며, 카테고리 탭 대신 개별 benchmark를 직접 보여준다.
- 한 화면에는 최대 6개 보드를 동시에 노출하고, 나머지는 좌/우 paging control로 넘긴다.
- `Arena`, `Capability`, `Multimodal` 같은 umbrella label은 전면에 두지 않는다.
- benchmark 제목은 raw id나 내부 taxonomy보다 **human readability**를 우선한다.
- leaderboard API가 비어 있거나 오류면 빈 상태 또는 오류 상태를 같은 visual system 안에서 표현한다.
- 메인 패널은 향후 agent workspace나 primary visualization으로 확장될 수 있지만, 현재는 leaderboard 중심이 canonical이다.

## Benchmark Grid Layout

패널 내부를 **보드 단위 카드**로 나눠 여러 benchmark를 동시에 비교하는 패턴이다.
현재 LeaderboardPanel이 canonical 구현체다.

### 구조

```
┌─ Panel Header ─────────────────────────────────────────┐
│ eyebrow  title        paging     session label  button │
├────────────────────────────────────────────────────────┤
│ board card │ board card │ board card                  │
│ board card │ board card │ board card                  │
└────────────────────────────────────────────────────────┘
```

### 패널 헤더

```html
<div class="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
  <div class="min-w-0 flex-1">
    <p class="font-mono text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-orbit-accent">
      Benchmark Grid
    </p>
    <h1 class="mt-2 font-display text-[1.12rem] font-semibold text-orbit-text">
      Live AI Benchmarks
    </h1>
    <p class="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-orbit-muted">
      showing 1-6 of 10 boards
    </p>
  </div>
  <div class="flex items-center gap-1">
    <button>left</button>
    <button>right</button>
  </div>
</div>
```

- 헤더 요약 문구는 `showing X-Y of N boards` 형식을 기본으로 사용한다.
- paging control은 내부 task tab이 아니라 **보드 묶음 자체를 좌우 이동**시키는 용도다.
- session label과 refresh button은 기존 orbit panel system을 유지한다.

### 보드 카드

각 카드는 하나의 benchmark board를 대표한다. 상위 그룹명보다 **보드명 자체가 첫 번째 시선 포인트**여야 한다.

```html
<article class="flex min-h-0 flex-col border border-orbit-border bg-orbit-bg">
  <div class="border-b border-orbit-border px-3 py-2.5">
    <p class="font-mono text-[0.56rem] uppercase tracking-[0.16em] text-orbit-accent">
      benchmark
    </p>
    <h3 class="mt-1.5 font-display text-[0.88rem] font-semibold text-orbit-text">
      Code
    </h3>
    <p class="mt-1 font-mono text-[0.5rem] uppercase tracking-[0.12em] text-orbit-muted">
      elo · coding tasks
    </p>
  </div>
  <div class="flex flex-wrap items-center justify-between gap-2 border-b border-orbit-border px-3 py-1.5">
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-mono text-[0.5rem] uppercase tracking-widest text-orbit-muted">2026-03-26</span>
      <span class="font-mono text-[0.5rem] uppercase tracking-widest text-orbit-muted">
        <span class="text-orbit-text">134</span> models
      </span>
    </div>
    <span class="font-mono text-[0.5rem] uppercase tracking-widest text-orbit-muted">
      <span class="text-orbit-text">2.1M</span> votes
    </span>
  </div>
</article>
```

- 타이틀은 `Capability`, `Arena`, `Multimodal` 같은 umbrella label보다 직접적인 benchmark 이름을 쓴다.
- `LMArena`, `Arena`, raw source id가 중복되면 제거해서 읽기 쉬운 이름으로 정리한다.
- subtitle은 `score label + 짧은 설명` 정도까지만 두고 taxonomy 설명이 본문을 압도하면 안 된다.

### 그리드 밀도

- desktop 기준 `3 x 2`로 최대 6개 보드를 동시에 보여준다.
- tablet에서는 `2 x N`, mobile에서는 `1 x N`로 자연스럽게 축소한다.
- 각 보드는 독립 스크롤을 허용하지만 첫 화면에서 최소 5~6개 entry는 바로 보여야 한다.

## Benchmark Entry Card

정보 행 단위 컴포넌트. 현재 leaderboard entry의 canonical 구현은 **rank + model name + organization + score**를 빠르게 읽는 데 집중한다.

### 구조

```
┌─────────────────────────────────────────────┐
│ rank │ model name                    score  │
│      │ organization                         │
└─────────────────────────────────────────────┘
```

### 마크업 골격

```html
<article class="orbit-leaderboard-entry">
  <div class="flex min-w-0 items-center gap-0">
    <div class="flex w-6 shrink-0 items-center justify-center self-stretch">
      <span class="font-mono text-[0.56rem] tabular-nums text-orbit-muted">1</span>
    </div>
    <div class="orbit-leaderboard-entry__body min-w-0 flex-1 border-l border-orbit-border px-2 py-2">
      <div class="flex min-w-0 items-baseline justify-between gap-2">
        <a class="font-display text-[0.76rem] font-semibold leading-snug text-orbit-text">Model Name</a>
        <span class="font-mono text-[0.58rem] tabular-nums text-orbit-accent">1,548.35</span>
      </div>
      <p class="mt-0.5 font-mono text-[0.52rem] uppercase tracking-widest text-orbit-muted">
        Anthropic
      </p>
    </div>
  </div>
</article>
```

- rank는 작은 mono 숫자로 처리하고 시선은 이름과 점수에 먼저 가야 한다.
- 점수는 accent color로 고정하고 organization은 muted uppercase로 보조한다.
- 링크가 있으면 model name 전체를 클릭 영역으로 둔다.

### Empty / Error State

- 보드가 하나도 없으면 `no benchmark boards` 메시지를 중앙 정렬로 보여준다.
- API 오류가 있지만 기존 보드 데이터가 있으면 헤더 아래 얇은 error strip으로 경고만 노출한다.
- API 오류와 보드 부재가 동시에 발생하면 전체 영역을 비운 상태로 에러 메시지를 중앙 표시한다.

## Chip / Badge Hierarchy

세 레벨로 강조 도를 구분한다. 같은 entry 안에서 정보 중요도를 한눈에 읽을 수 있도록 엄격히 지킨다.

| 레벨 | 용도 | 클래스 |
|------|------|--------|
| **Accent** | 핵심 수치 (ELO, score) | `border-orbit-accent/40 bg-orbit-accent/5 text-orbit-accent` |
| **Standard** | 부가 메타 (org, votes, ctx, license) | `border-orbit-border bg-orbit-bg text-orbit-text` |
| **Muted** | 2차 정보 (license 변형, 가격) | `border-orbit-border/40 bg-orbit-bg text-orbit-muted` |

공통 베이스: `inline-flex border px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest`

```html
<!-- accent chip: score -->
<span class="inline-flex border border-orbit-accent/40 bg-orbit-accent/5 px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest text-orbit-accent">
  score 1,327
</span>

<!-- standard chip: org, votes, ctx -->
<span class="inline-flex border border-orbit-border bg-orbit-bg px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest text-orbit-text">
  Anthropic
</span>

<!-- muted chip: price, license -->
<span class="inline-flex border border-orbit-border/40 bg-orbit-bg px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest text-orbit-muted">
  in $0.003/M
</span>
```

## Numeric Score Treatment

현재 benchmark entry의 canonical 표현은 별도 score bar가 아니라 **우측 정렬된 숫자 score**다.

규칙:
- score는 `tabular-nums + orbit-accent` 조합으로 고정한다.
- 같은 보드 안에서는 자리수와 정렬이 흔들리지 않도록 폭 변화를 최소화한다.
- score가 `null`이면 점수 영역을 비우고 이름/organization만 유지한다.

## Summary And Source Panel Rules

### Summary Panel

- title은 `Today in AI` 같은 plain-language 요약 제목을 사용한다.
- 각 카드는 `domain`, `headline`, `summary`를 우선하고 operator metadata는 넣지 않는다.
- digest 선택 시 info workspace를 detail override로 전환한다.

### Digest Detail

- digest detail은 `domain`, `headline`, `summary`, `related items` 중심으로 구성한다.
- `session_id`, `status`, `evidence`, `document ids` 같은 operator metadata는 사용자용 detail에서 노출하지 않는다.

### Source Panels

- eyebrow는 category label을 사용한다. 예: `Papers`, `Models`, `Community`
- title은 source name을 prettify한 결과를 사용한다.
- 각 item은 `source badge`, `type badge`, `meta`, `title`, `note` 조합으로 유지한다.
- compact 높이에서는 각 item이 최소 `title + date`를 보여줘서 빠르게 훑을 수 있어야 한다.
- source item 클릭은 먼저 document detail만 열고, 원문 open은 detail panel의 명시적 action으로 분리한다.

## Fullscreen Loading Rules

현재 구현에서 가장 중요한 UX 규칙 중 하나는 fullscreen loading이다.

### When Fullscreen Loading Appears

- 첫 진입 후 active session이 아직 없을 때
- backend가 homepage bootstrap을 진행할 때
- `reload session` 실행 중일 때
- 새로고침 이후 reload state를 복구했을 때

### What It Must Show

fullscreen loading은 아래 정보를 항상 표시해야 한다.

1. 현재 stage label
2. progress bar
3. `currentSource` 또는 상세 설명
4. `progressCurrent / progressTotal`
5. backend가 내려준 `loading.detail`

즉 "로딩 중" 한 줄이 아니라, 지금 무슨 데이터를 처리 중인지 운영 콘솔처럼 보여주는 것이 기준이다.

## Step Visualization Rules

backend가 내려주는 `loading.steps`는 현재 7단계다.

1. `Prepare`
2. `Collect`
3. `Normalize`
4. `Publish Docs`
5. `Publish Views`
6. `Summarize`
7. `Digests`

frontend는 이 단계를 재해석하지 않고 가능한 그대로 렌더링한다.

상태 규칙:

- `pending`: muted tone
- `active`: strong border + bright text
- `complete`: accent tone
- `error`: strong border + error 의미의 상태 텍스트

## Streaming UX Rules

현재 frontend는 polling보다 SSE를 우선 사용한다.

### Dashboard Stream

- `/api/dashboard/stream?session=active`
- homepage bootstrap 중 fullscreen loading과 main dashboard 상태를 함께 갱신

### Reload Stream

- `/api/sessions/reload/stream`
- reload 전용 fullscreen loading 진행률 갱신

### Refresh Recovery

- 새로고침 시에는 먼저 `GET /api/sessions/reload`를 읽어 ongoing reload가 있는지 확인한다.
- 진행 중이면 일반 화면으로 바로 돌아가지 않고 reload fullscreen loading을 복구한다.
- reload 중에는 `beforeunload` 경고를 걸어 accidental refresh를 줄인다.

## Motion And Overlay Rules

- `orbit-hacker-reveal`은 detail card와 leaderboard row 같은 정보 블록에만 제한적으로 사용한다.
- motion은 장식이 아니라 정보 등장 타이밍을 드러내는 용도여야 한다.
- `prefers-reduced-motion`과 `data-orbit-motion="off"` 둘 다 지원해야 한다.
- overlay는 `orbit-grid`, `orbit-scanlines` 두 층으로 유지하고, settings에서 끌 수 있어야 한다.

## Settings Modal Rules

현재 settings modal은 단순 환경설정이 아니라 workspace control panel 역할을 한다.

필수 항목:

- `Motion Effects`
- `Ambient Overlay`
- `Panel Height` (`compact`, `standard`, `tall`)
- `Layout Reset`
- `Restore Defaults`

규칙:

- 변경값은 localStorage에 저장한다.
- 설정 변경은 현재 화면에 즉시 반영한다.
- modal은 backdrop click과 `Esc`로 닫힌다.

## Files To Read Together

| File | Role |
|------|------|
| `src/App.tsx` | fullscreen loading, SSE, main dashboard, settings modal |
| `src/index.css` | tokens, grid/scanline, loader styling, hacker reveal, orbit-leaderboard-entry |
| `src/components/dashboard/LeaderboardPanel.tsx` | benchmark grid layout, left/right paging, board card, compact entry card — canonical 구현체 |
| `src/components/dashboard/styles.ts` | panel, label, pill primitive |
| `src/components/dashboard/DashboardPanel.tsx` | 공통 panel header structure |
| `src/components/dashboard/PanelWorkspace.tsx` | main/info/summary layout, drag/resize |
| `src/components/dashboard/SourcePanel.tsx` | source feed card layout |
| `src/components/dashboard/SummaryPanel.tsx` | digest card layout |
| `src/components/dashboard/panelWorkspaceStorage.ts` | localStorage persistence keys |
| `src/features/dashboard/detailPanels.tsx` | HackerRevealCard, detail field grid, chip block |

## Verification Checklist

1. 첫 진입 시 active session이 없으면 fullscreen loader가 뜨는가
2. loader에 현재 source 또는 상세 처리 문구가 보이는가
3. step card가 `Prepare -> Digests` 순서로 보이는가
4. reload 중 새로고침 후에도 loader가 복구되는가
5. 요약, 피드, 세션, detail 패널이 같은 border/fill/type scale 체계를 공유하는가
6. `Motion Effects`를 끄면 reveal 애니메이션이 사라지는가
7. `Ambient Overlay`를 끄면 grid와 scanline만 꺼지고 정보 밀도는 유지되는가
8. panel height 변경이 info workspace의 row density를 실제로 바꾸는가

### Benchmark Grid / Entry Card 체크리스트

9. 첫 화면에서 benchmark board가 최대 6개까지 동시에 보이는가
10. `Arena`, `Capability`, `Multimodal` 같은 상위 그룹 탭 없이 보드가 직접 노출되는가
11. 좌/우 control이 board batch를 이동시키고 현재 page 범위를 헤더에서 읽을 수 있는가
12. 보드 타이틀이 raw id 대신 읽기 쉬운 이름으로 정리되는가
13. 메타 스트립에서 수치(숫자)는 `text-orbit-text`, 단위는 `text-orbit-muted`인가
14. 각 entry card에 rank, 이름, organization, score 순서가 유지되는가
15. score는 accent color의 고정 숫자로 보이고 score bar는 렌더링되지 않는가
16. score가 없는 항목에서도 entry card 레이아웃이 무너지지 않는가

## Non-Goals

- 랜딩 페이지 브랜딩 문서가 아니다.
- Redis, collector, backend data model 문서가 아니다.
- source lane 구성이나 normalized contract를 대체하지 않는다.
