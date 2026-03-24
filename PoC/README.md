# SparkOrbit PoC

World Monitor PoC를 진행하는 공간. docs의 설계를 코드로 검증하고 실험한다.

- [source_fetch](./source_fetch/) — 37개 source에서 데이터를 수집하는 collection pipeline
- [llm_enrich](./llm_enrich/) — `source_fetch` run을 읽어 company filter enrichment를 수행하는 local LLM PoC
