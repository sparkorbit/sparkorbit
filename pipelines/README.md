# SparkOrbit Pipelines

데이터 수집 및 LLM 판정/분류 파이프라인.

- [source_fetch](./source_fetch/) — 44개 source에서 데이터를 수집하는 collection pipeline
- [llm_enrich](./llm_enrich/) — `source_fetch` run을 읽어 company filter 판정 / paper domain 분류를 수행하는 local LLM pipeline
