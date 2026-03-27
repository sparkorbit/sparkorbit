<p align="center">
  <a href="./README.md">🇺🇸 English</a> · <a href="./README.ko.md">🇰🇷 한국어</a>
</p>

# SparkOrbit Docs

SparkOrbit 프로젝트 기술 문서의 시작점입니다.

***

## 문서 언어 정책

- 앞으로 문서의 기준 언어는 영어입니다.
- 한국어 문서는 가능한 경우 `.ko.md` 파일로 별도 관리합니다.
- 일부 한국어 문서는 아직 요약/안내 수준이며, 영어 기준 문서를 따라 점진적으로 보강합니다.
- 일부 상세 문서는 아직 예전의 공용 초안 상태이며, 점진적으로 영어 기준 구조로 옮길 예정입니다.

***

## 기술 스택

| Category | Technologies |
|----------|-------------|
| Frontend | React 19, Vite, Tailwind CSS, Inter + Pretendard + JetBrains Mono |
| Backend | FastAPI, Redis, HTTP polling |
| Collection | Python 3.13 async pipeline (httpx, feedparser, BeautifulSoup) |
| LLM | Ollama + Qwen 3.5 4B (local, optional) |
| Deployment | Docker Compose (frontend, backend, worker, redis, ollama) |

***

## 문서 목록

| 문서 | 설명 |
|-----|-------------|
| [Overall Flow](./01_overall_flow.ko.md) | 제품 흐름, 사용자 여정, 현재 구현 범위 |
| [Sections](./02_sections/README.ko.md) | source와 필드 관련 섹션 인덱스 |
| [Sources](./02_sections/02_1_sources.ko.md) | source 목록과 선정 기준 |
| [Fields](./02_sections/02_2_fields.ko.md) | normalized field contract 안내 페이지 |
| [Runtime Flow](./03_runtime_flow_draft.ko.md) | backend, Redis session, polling 흐름 안내 |
| [LLM Usage](./04_llm_usage.ko.md) | LLM 레이어 한국어 안내 페이지 |
| [Collection Pipeline](./05_data_collection_pipeline.ko.md) | 수집 파이프라인 구조와 산출물 안내 |
| [UI Design Guide](./06_ui_design_guide.ko.md) | UI 문서 한국어 안내 페이지 |
| [Panel Instruction Packs](./07_panel_instruction_packs.ko.md) | prompt pack 운영 정책 안내 |
| [Data Schema & Links](./08_data_schema_and_links.ko.md) | 데이터 스키마 문서 한국어 안내 페이지 |

***

## 읽는 순서

1. 제품 목표와 현재 범위는 [Overall Flow](./01_overall_flow.ko.md)부터 읽습니다.
2. source 목록은 [Sources](./02_sections/02_1_sources.ko.md), 필드 계약은 [Fields](./02_sections/02_2_fields.ko.md)를 봅니다.
3. backend, Redis session, polling 흐름은 [Runtime Flow](./03_runtime_flow_draft.ko.md)를 봅니다.
4. collection pipeline과 frontend 규칙은 [Collection Pipeline](./05_data_collection_pipeline.ko.md), [UI Design Guide](./06_ui_design_guide.ko.md)를 봅니다.
5. LLM enrichment 관련 내용은 [LLM Usage](./04_llm_usage.ko.md)를 봅니다.

## 마이그레이션 참고

- 인덱스와 문서 정책은 영어 기준으로 정리하기 시작했습니다.
- `01`, `02.1`, `03`, `05`, `07`은 영어 기준 문서 흐름을 먼저 정리했습니다.
- `02.2`, `04`, `06`, `08`은 아직 영어 재작성 단계가 남아 있어, 한국어 페이지도 현재는 안내용 성격이 더 강합니다.
