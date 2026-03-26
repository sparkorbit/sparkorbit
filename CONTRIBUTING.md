# Contributing to SparkOrbit

## 시작 전에

- [docs/01_overall_flow.md](./docs/01_overall_flow.md) — 전체 흐름
- [docs/05_data_collection_pipeline.md](./docs/05_data_collection_pipeline.md) — 파이프라인 구조
- [docs/02_sections/02_2_fields.md](./docs/02_sections/02_2_fields.md) — normalized field contract

이슈를 먼저 열어 논의한 뒤 PR을 올려주세요. 큰 변경일수록 사전 논의가 중요합니다.

## 핵심 규칙

**Artifact Immutability**
`normalized/documents.ndjson`, `labels/*.ndjson` 같은 run artifact는 덮어쓰거나 임의 수정하지 않는다. 다른 출력이 필요하면 prompt pack이나 provider 코드를 수정하고 재생성한다.

**Summary/Briefing 수정 금지**
summary나 briefing 본문을 직접 손으로 다듬는 방식은 허용하지 않는다. generation rule(prompt pack, provider)을 수정한 뒤 재생성한다.

**Source Adapter 독립성**
각 source adapter는 독립적으로 유지한다. HTTP 에러나 파싱 실패는 skip하고 다음 source로 넘어간다.

**무료, 인증 없는 소스 우선**
새 source를 추가할 때 API 키나 인증이 필요한 소스는 원칙적으로 받지 않는다.

## 로컬 설정

```bash
# collection pipeline
cd pipelines/source_fetch
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.lock.txt

# 전체 스택
bash scripts/docker-up.sh
```

## 변경 유형별 가이드

| 유형 | 주의사항 |
|------|----------|
| 새 source 추가 | `adapters.py`에 독립 adapter 추가, normalized contract shape 유지 |
| LLM prompt 수정 | `prompt_version` 올리고 재생성 결과 포함 |
| Backend API 변경 | field명, enum, loading stage를 docs와 함께 업데이트 |
| Frontend 변경 | backend API/BFF만 사용, run artifact 직접 접근 금지 |

## 테스트

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
```

## PR 체크리스트

- [ ] 기존 테스트 통과
- [ ] docs와 코드의 수치·enum·필드명 일치 확인
- [ ] artifact immutability 규칙 준수
- [ ] 새 source라면 인증 불필요 확인
