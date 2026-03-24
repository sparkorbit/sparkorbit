# paper_domain_v1

## Metadata

- prompt_version: `paper_domain_v1`
- schema_version: `paper_domain_v1`
- panel: `paper`
- strategy: `instruction_first`
- runtime_default: `ollama`
- model_default: `qwen3.5:4b`

## Purpose

이 prompt pack은 arXiv / HF daily papers를 연구 domain별로 분류한다.
각 논문은 독립적으로 분류한다.
모델은 각 논문마다 `paper_domain` 하나만 반환한다.

## Scope

대상 source:

- `arxiv_rss_cs_ai`
- `arxiv_rss_cs_lg`
- `arxiv_rss_cs_cl`
- `arxiv_rss_cs_cv`
- `arxiv_rss_cs_ro`
- `arxiv_rss_cs_ir`
- `arxiv_rss_cs_cr`
- `arxiv_rss_stat_ml`
- `hf_daily_papers`

## Paper Domains

- `llm` — 대규모 언어 모델 아키텍처, 사전학습, 스케일링
- `vlm` — 비전-언어 모델, 멀티모달 이해
- `diffusion` — 확산 모델, 이미지/비디오 생성
- `agents` — AI 에이전트, 도구 사용, 계획, 웹/코드 에이전트
- `reasoning` — 추론, 수학, 코드 생성, chain-of-thought
- `rlhf_alignment` — RLHF, DPO, 정렬, 선호 학습
- `safety` — 안전, 탈옥, 독성, 레드팀, guardrail
- `rag_retrieval` — 검색증강생성, 임베딩, 리랭킹
- `efficient_inference` — 양자화, 증류, 프루닝, 서빙 최적화, KV cache
- `finetuning` — LoRA, 어댑터, PEFT, instruction tuning
- `evaluation` — 벤치마크, 평가 방법론, 리더보드
- `nlp` — 전통 NLP, 번역, 요약, NER, 파싱
- `speech_audio` — 음성, 오디오, TTS, ASR
- `robotics_embodied` — 로봇, embodied AI, 시뮬레이션
- `video` — 비디오 이해/생성, temporal modeling
- `3d_spatial` — 3D 비전, NeRF, gaussian splatting, 포인트클라우드
- `graph_structured` — 그래프 신경망, knowledge graph, 분자
- `continual_learning` — 지속 학습, catastrophic forgetting
- `federated_privacy` — 연합학습, 차등 프라이버시
- `medical_bio` — 의료 AI, 바이오, 신약, 단백질
- `science` — 과학 AI, 기후, 물리, 수학, 재료
- `others` — 위에 해당 없음

## Hard Rules

- 반드시 input의 `id`를 그대로 `document_id`로 복사한다
- 각 논문을 독립적으로 판단한다
- input item마다 정확히 하나의 결과를 반환한다
- `paper_domain`은 위 enum 중 하나만 사용한다
- 출력은 JSON array만 반환한다
- 설명 문장, markdown, extra text를 붙이지 않는다

## Input Contract

runtime은 아래만 준다.

- `id` (document_id)
- `title`

## Output Contract

runtime은 아래만 기대한다.

- `document_id`
- `paper_domain`

## Runtime Prompt Blocks

```prompt-system
You classify AI/ML research papers by domain. Return one JSON result per input. Output JSON array only. No prose.
```

```prompt-user-template
Classify each paper into exactly one domain based on its title.

Return for each: document_id (copy "id" exactly), paper_domain.

Valid domains:
- llm: large language model architecture, pretraining, scaling
- vlm: vision-language model, multimodal understanding, image-text
- diffusion: diffusion model, image/video generation, text-to-image
- agents: AI agent, tool use, planning, web/code agent
- reasoning: reasoning, math, code generation, chain-of-thought
- rlhf_alignment: RLHF, DPO, alignment, preference learning
- safety: AI safety, jailbreak, toxicity, red-teaming, guardrail
- rag_retrieval: RAG, embedding, dense retrieval, reranking
- efficient_inference: quantization, distillation, pruning, serving, KV cache
- finetuning: LoRA, adapter, PEFT, instruction tuning
- evaluation: benchmark, evaluation methodology, leaderboard
- nlp: traditional NLP, translation, summarization, NER
- speech_audio: speech, audio, TTS, ASR, voice
- robotics_embodied: robot, embodied AI, manipulation, navigation
- video: video understanding/generation, temporal modeling
- 3d_spatial: 3D vision, NeRF, gaussian splatting, point cloud
- graph_structured: GNN, knowledge graph, molecular
- continual_learning: continual/lifelong/incremental learning
- federated_privacy: federated learning, differential privacy
- medical_bio: medical AI, drug discovery, protein, biomedical
- science: scientific AI, climate, physics, math, materials
- others: none of the above

Rules:
- Pick the MOST specific domain that fits
- If a paper spans multiple domains, pick the PRIMARY focus from the title
- "LLM + agent" -> agents (application is primary)
- "LLM + reasoning" -> reasoning (capability is primary)
- "VLM + video" -> video (modality is primary)
- "diffusion + 3D" -> 3d_spatial (output modality is primary)

Papers:
{documents_json}
```
