[Index](./README.md) · [01. Overall Flow](./01_overall_flow.md) · [02. Sections](./02_sections/README.md) · [03. Runtime Flow](./03_runtime_flow_draft.md) · [04. LLM Usage](./04_llm_usage.md) · [05. Data Collection Pipeline](./05_data_collection_pipeline.md) · **06. UI Design Guide**

---

# SparkOrbit Docs - 06. UI Design Guide

> Canonical UI direction for the current frontend
> Last updated: 2026-03-25

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
- 본문 상단은 leaderboard board selector, 하단은 top entry list를 렌더링한다.
- leaderboard API가 비어 있거나 오류면 빈 상태 또는 오류 상태를 같은 visual system 안에서 표현한다.
- 메인 패널은 향후 agent workspace나 primary visualization으로 확장될 수 있지만, 현재는 leaderboard 중심이 canonical이다.

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
| `src/index.css` | tokens, grid/scanline, loader styling, hacker reveal |
| `src/components/dashboard/styles.ts` | panel, label, pill primitive |
| `src/components/dashboard/DashboardPanel.tsx` | 공통 panel header structure |
| `src/components/dashboard/PanelWorkspace.tsx` | main/info/summary layout, drag/resize |
| `src/components/dashboard/SourcePanel.tsx` | source feed card layout |
| `src/components/dashboard/SummaryPanel.tsx` | digest card layout |
| `src/components/dashboard/panelWorkspaceStorage.ts` | localStorage persistence keys |

## Verification Checklist

1. 첫 진입 시 active session이 없으면 fullscreen loader가 뜨는가
2. loader에 현재 source 또는 상세 처리 문구가 보이는가
3. step card가 `Prepare -> Digests` 순서로 보이는가
4. reload 중 새로고침 후에도 loader가 복구되는가
5. 요약, 피드, 세션, detail 패널이 같은 border/fill/type scale 체계를 공유하는가
6. `Motion Effects`를 끄면 reveal 애니메이션이 사라지는가
7. `Ambient Overlay`를 끄면 grid와 scanline만 꺼지고 정보 밀도는 유지되는가
8. panel height 변경이 info workspace의 row density를 실제로 바꾸는가

## Non-Goals

- 랜딩 페이지 브랜딩 문서가 아니다.
- Redis, collector, backend data model 문서가 아니다.
- source lane 구성이나 normalized contract를 대체하지 않는다.
