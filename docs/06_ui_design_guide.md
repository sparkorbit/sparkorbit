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
- source, type, status, evidence는 mono badge family로 통일한다.

## Surface Rules

### Panels

- sharp corner를 유지한다.
- 면 분리는 shadow보다 border와 fill step으로 만든다.
- 패널 기본 구조는 `eyebrow -> title -> session label -> content`다.
- summary panel과 source panel은 같은 primitive를 공유하고, detail panel만 정보량에 맞춰 변형한다.

### Tags And Pills

- 둥근 pill보다 직사각형 badge 느낌을 우선한다.
- source, type, status, evidence는 모두 같은 family에서 파생한다.
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
- 본문은 **3-column split layout**으로 카테고리를 가로로 분할해서 보여준다.
- leaderboard API가 비어 있거나 오류면 빈 상태 또는 오류 상태를 같은 visual system 안에서 표현한다.
- 메인 패널은 향후 agent workspace나 primary visualization으로 확장될 수 있지만, 현재는 leaderboard 중심이 canonical이다.

## Column Split Layout

패널 내부를 가로로 분할해서 동종 정보를 나란히 보여주는 패턴이다.
현재 LeaderboardPanel이 canonical 구현체다.

### 구조

```
┌─ Panel Header ─────────────────────────────────────────┐
│ eyebrow  title                   session label  button │
├──────────────┬──────────────┬──────────────────────────┤
│ COL A        │ COL B        │ COL C                    │
│ accent label │ accent label │ accent label             │
│ muted sub    │ muted sub    │ muted sub                │
├──────────────┼──────────────┼──────────────────────────┤
│ [tab][tab]   │ [tab]        │ [tab][tab][tab]          │
├──────────────┼──────────────┼──────────────────────────┤
│ meta strip   │ meta strip   │ meta strip               │
├──────────────┼──────────────┼──────────────────────────┤
│ entry card   │ entry card   │ entry card               │
│ entry card   │ entry card   │ entry card               │
│  (scroll)    │  (scroll)    │  (scroll)                │
└──────────────┴──────────────┴──────────────────────────┘
```

### 컬럼 헤더

```html
<div class="border-b border-orbit-border px-3 py-2.5">
  <p class="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-orbit-accent">
    Group Label
  </p>
  <p class="mt-0.5 font-mono text-[0.54rem] uppercase tracking-widest text-orbit-muted">
    sublabel description
  </p>
</div>
```

- accent label: `text-[0.62rem]`, `tracking-[0.18em]`, `font-semibold`
- sublabel: `text-[0.54rem]`, `tracking-widest`, `text-orbit-muted`

### 탭 바 (Tab Bar)

보드/카테고리 전환용 탭. **항목이 하나여도 항상 렌더링**한다.

```html
<div class="flex gap-0.5 overflow-x-auto border-b border-orbit-border bg-orbit-panel px-1.5 py-1">
  <!-- active tab -->
  <button class="border border-orbit-accent bg-orbit-bg text-orbit-accent ...">Label</button>
  <!-- inactive tab -->
  <button class="border-transparent text-orbit-muted hover:border-orbit-border hover:text-orbit-text ...">Label</button>
</div>
```

- 탭 텍스트: `text-[0.54rem]`, `uppercase`, `tracking-[0.12em]`
- 활성: `border-orbit-accent bg-orbit-bg text-orbit-accent`
- 비활성: `border-transparent text-orbit-muted`
- hover: `border-orbit-border text-orbit-text`

### 메타 스트립 (Meta Strip)

선택된 보드/카테고리의 집계 수치와 외부 링크를 1줄로 보여주는 얇은 행이다.

```html
<div class="flex flex-wrap items-center justify-between border-b border-orbit-border px-3 py-1.5">
  <!-- left: counts -->
  <div class="flex gap-x-2">
    <span class="font-mono text-[0.52rem] uppercase tracking-widest text-orbit-muted">
      <span class="text-orbit-text">1,234</span> mdl
    </span>
    <span class="font-mono text-[0.52rem] uppercase tracking-widest text-orbit-muted">
      <span class="text-orbit-text">2.1M</span> v
    </span>
  </div>
  <!-- right: date + source link -->
  <div class="flex items-center gap-2">
    <span class="font-mono text-[0.5rem] uppercase tracking-widest text-orbit-muted">2026-03-26</span>
    <a class="font-mono text-[0.52rem] uppercase tracking-widest text-orbit-accent underline underline-offset-2 hover:text-orbit-text">↗</a>
  </div>
</div>
```

- 수치 숫자: `text-orbit-text`로 강조, 단위는 `text-orbit-muted`
- 날짜: `text-[0.5rem]`, muted
- 링크: accent underline, `↗` 기호로 외부 출처 표시

## Entry Card

정보 행 단위 컴포넌트. 현재 leaderboard entry가 canonical 구현체이며, 다른 섹션의 ranked/scored 아이템에도 동일하게 적용한다.

### 구조

```
┌─────────────────────────────────────────────┐
│ rank  │ model name (링크 또는 텍스트)         │
│  #1   │ chip  chip  chip                    │
│       │ [price chip] [price chip]           │
│       │ ─────────────────────── 98.2%       │  ← score bar
└─────────────────────────────────────────────┘
```

### 마크업 골격

```html
<article class="orbit-leaderboard-entry">
  <div class="flex min-w-0">
    <!-- rank badge -->
    <div class="orbit-leaderboard-entry__rank flex w-9 shrink-0 items-start justify-center px-1.5 py-2.5">
      <span class="font-mono text-[0.64rem] font-bold tabular-nums text-orbit-accent">#1</span>
    </div>
    <!-- body -->
    <div class="orbit-leaderboard-entry__body min-w-0 flex-1 border-l border-orbit-border px-2 py-2.5">
      <a class="font-display text-[0.8rem] font-semibold leading-[1.35] text-orbit-text ...">Model Name</a>
      <!-- chip row -->
      <div class="mt-1.5 flex flex-wrap gap-1"> ... </div>
      <!-- price chip row -->
      <div class="mt-1 flex flex-wrap gap-1"> ... </div>
      <!-- score bar -->
      <ScoreBar score={...} maxScore={...} />
    </div>
  </div>
</article>
```

- CSS class `orbit-leaderboard-entry`에서 border, bg, box-shadow를 모두 받는다.
- rank 컬럼과 body 컬럼은 `border-l border-orbit-border`로 분리된다.
- 항목 제목에 링크가 있으면 `underline underline-offset-4 hover:text-orbit-accent` 처리한다.

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

## Score Bar

같은 컬럼/섹션 내 항목들의 수치를 **최댓값 대비 상대 비율**로 보여주는 인라인 바.

```html
<div class="mt-2 flex items-center gap-1.5">
  <div class="relative h-0.5 flex-1 overflow-hidden bg-orbit-border">
    <div class="absolute inset-y-0 left-0 bg-orbit-accent" style="width: 98.2%"></div>
  </div>
  <span class="w-9 text-right font-mono text-[0.52rem] tabular-nums text-orbit-accent">98.2%</span>
</div>
```

규칙:
- `maxScore`는 현재 뷰에 보이는 항목 전체에서 계산한다. 다른 탭/컬럼과 섞지 않는다.
- 최솟값 pct는 2%로 floor해서 0인 항목도 바가 전혀 안 보이는 상황을 막는다.
- score가 `null`이면 바를 렌더링하지 않는다.

## Summary And Source Panel Rules

### Summary Panel

- title은 `Category Digest`
- 각 카드는 `domain`, `evidence`, `headline`, `summary`를 보여준다.
- digest 선택 시 info workspace를 detail override로 전환한다.

### Source Panels

- eyebrow는 category label을 사용한다. 예: `Papers`, `Models`, `Community`
- title은 source name을 prettify한 결과를 사용한다.
- 각 item은 `source badge`, `type badge`, `meta`, `title`, `note` 조합으로 유지한다.
- source item 클릭 시 document detail fetch와 원문 open이 함께 일어날 수 있다.

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
| `src/components/dashboard/LeaderboardPanel.tsx` | column split layout, tab bar, meta strip, entry card, score bar — canonical 구현체 |
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

### Column Split / Entry Card 체크리스트

9. column 헤더에 accent label + muted sublabel이 있는가
10. 탭 바는 항목이 하나뿐이어도 렌더링되는가
11. 활성 탭은 `border-orbit-accent`로 표시되는가
12. 메타 스트립에서 수치(숫자)는 `text-orbit-text`, 단위는 `text-orbit-muted`인가
13. 각 entry card에 rank, 이름, chip row, score bar 순서로 쌓이는가
14. accent chip(score)과 standard chip(org, votes)과 muted chip(price)의 border/bg/text가 구분되는가
15. score bar의 `maxScore`는 같은 컬럼 내 항목에서만 계산하는가
16. score가 없는 항목에서 score bar가 렌더링되지 않는가

## Non-Goals

- 랜딩 페이지 브랜딩 문서가 아니다.
- Redis, collector, backend data model 문서가 아니다.
- source lane 구성이나 normalized contract를 대체하지 않는다.
