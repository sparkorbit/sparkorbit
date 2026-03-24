[Index](./README.md) · [01. Overall Flow](./01_overall_flow.md) · [02. Sections](./02_sections/README.md) · [03. Runtime Flow](./03_runtime_flow_draft.md) · [04. LLM Usage](./04_llm_usage.md) · [05. Data Collection Pipeline](./05_data_collection_pipeline.md) · **06. UI Design Guide**

---

# SparkOrbit Docs - 06. UI Design Guide

> Canonical UI direction for the current frontend
> Last updated: 2026-03-24

## Purpose

이 문서는 현재 `src/` 아래 React dashboard의 시각 언어와 상태 표현 규칙을 설명한다.

범위:

- hacker console 톤
- panel / tag / typography rules
- fullscreen loading / reload UX
- SSE 상태 반영 방식

범위 밖:

- source 선정
- normalized field contract
- Redis key schema

## Current UI Direction

SparkOrbit의 현재 UI는 futuristic neon landing page보다 **운영 콘솔 + 해커톤 대시보드**에 가깝게 보이는 것이 맞다.

핵심 방향:

1. 검은 바탕 위에 녹색 계열 정보층을 올린다.
2. 장식보다 정보 밀도와 단계 표현을 우선한다.
3. 카드/패널은 sharp edge, 얇은 border, dense metadata를 기본으로 한다.
4. 로딩도 단순 spinner가 아니라 운영 상태판처럼 보여야 한다.

## Visual Tokens

현재 프로토타입은 아래 토큰을 기본으로 사용한다.

| Token | Value | Usage |
|------|-------|-------|
| `bg` | `#050705` | 앱 전체 바탕 |
| `bg-elevated` | `#0b100b` | 상단 바, elevated blocks |
| `panel` | `#0d130d` | 패널 기본 면 |
| `border` | `#233223` | 기본 구획선 |
| `border-strong` | `#3a5a33` | active/hover/강조 |
| `text` | `#d6f5d0` | 기본 본문 |
| `muted` | `#7e957d` | note, hint, 보조 메타 |
| `accent` | `#8dfc54` | 라벨, 진행 상태, 핵심 강조 |
| `accent-dim` | `#4f7a43` | 약한 강조, source note |

보조 색상은 black/green 범위 안에서 해결한다.

## Typography

| Role | Font |
|------|------|
| 제목, 본문 | `IBM Plex Sans KR` |
| 상태, 수치, 라벨, 메타 | `IBM Plex Mono` |
| Fallback | `Noto Sans KR` |

규칙:

- 섹션 라벨은 mono + uppercase + 넓은 tracking
- 본문은 작은 크기라도 line-height를 충분히 유지
- source/type/status/evidence는 mono 태그로 통일

## Surface Rules

### Panels

- sharp corner를 유지한다.
- 면 분리는 shadow보다 border와 fill step으로 만든다.
- 각 panel은 `eyebrow -> title -> session label -> content` 구조를 공유한다.

### Tags And Pills

- 둥근 pill보다 직사각형 badge 느낌을 우선한다.
- source/type/status/evidence는 모두 같은 family에서 파생한다.
- selected 상태는 `border-orbit-accent`로 드러낸다.

### Background

- 전체 배경은 solid black 기반이다.
- 보조 장식은 grid / scanline 수준까지만 허용한다.
- hero 일러스트나 soft glass 배경은 기본 방향이 아니다.

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

즉 “로딩 중” 한 줄이 아니라, **지금 무슨 데이터를 처리 중인지**를 운영 콘솔처럼 보여주는 것이 기준이다.

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

## Main Dashboard Layout

현재 화면은 대략 아래 구조를 따른다.

| Area | Role |
|------|------|
| `ConsoleHeader` | 브랜딩, 세션 식별, 설정 진입 |
| `Main Panel` | 현재 상태 요약, top headline, top feed items |
| `Session Panel` | runtime state, progress, metrics, rules |
| `Source Panels` | source별 상위 3개 feed item |
| `Summary Panel` | category digest 요약 |
| `Detail Panel` | digest detail 또는 document detail |

## Interaction Rules

- source item 클릭 시 document detail fetch와 원문 open이 같이 일어날 수 있다.
- digest 클릭 시 관련 문서를 묶어 보여준다.
- reload 버튼은 새 run 생성 요청이며, 클릭 후 fullscreen loading으로 전환된다.
- reload 중에는 `beforeunload` 경고를 걸어 accidental refresh를 줄인다.

## Files To Read Together

| File | Role |
|------|------|
| `src/App.tsx` | fullscreen loading, SSE, main dashboard state |
| `src/index.css` | tokens, grid/scanline, loader styling |
| `src/components/dashboard/styles.ts` | panel/tag/card primitive |
| `src/components/dashboard/SessionPanel.tsx` | runtime/loading step rendering |
| `src/components/dashboard/SourcePanel.tsx` | feed card layout |
| `src/components/dashboard/SummaryPanel.tsx` | digest card layout |

## Verification Checklist

1. 첫 진입 시 active session이 없으면 fullscreen loader가 뜨는가
2. loader 아래에 현재 source 또는 상세 처리 문구가 보이는가
3. step card가 `Prepare -> Digests` 순서로 보이는가
4. reload 중 새로고침 후에도 loader가 복구되는가
5. 요약/피드/세션 패널이 같은 border/fill/type scale 체계를 공유하는가
6. 전체 화면이 black/green console tone을 유지하는가

## Non-Goals

- 랜딩 페이지 브랜딩 문서가 아니다.
- Redis/collector/backend data model 문서가 아니다.
- source lane 구성이나 normalized contract를 대체하지 않는다.
