[Index](./README.md) · [🇰🇷 한국어](./07_panel_instruction_packs.ko.md) · [01. Overall Flow](./01_overall_flow.md) · [04. LLM Usage](./04_llm_usage.md) · [06. UI Design Guide](./06_ui_design_guide.md) · **07. Panel Instruction Packs**

---

# SparkOrbit - 07. Panel Instruction Packs

> Canonical instruction-pack policy
> Last updated: 2026-03-27

## 0. Purpose

This document defines how SparkOrbit manages panel-specific LLM instructions.

Core rules:

- Keep instructions separated by panel
- Version instruction packs as Markdown files
- Let runtime code read those Markdown prompt packs directly when possible
- Version prompt, schema, and fallback rules together

## 1. Why We Split Packs By Panel

`Paper`, `Company`, `Community`, and `Benchmark` require different judgment criteria.

For example:

- `Company / Release` needs keep/drop filtering and domain classification
- `Paper` needs topic grouping and novelty judgment
- `Community` needs reaction intensity and discussion quality
- `Benchmark` needs raw metric interpretation and watchout notes

Because of that, panel-specific instruction packs are more stable than one generic prompt.

## 2. Current Strategy

The current strategy is `instruction-first`.

That means:

- Use strong system instructions
- Narrow the input/output contract
- Lock down enums and JSON schema tightly
- Keep few-shot examples in docs, but only inject them at runtime when needed

This fits the current scope because SparkOrbit is using `Qwen3.5-4B` for structured enrichment.
With a smaller model, short and explicit instructions plus a narrow schema stabilize faster than heavy few-shot prompting.

## 3. File Rules

Prompt pack files follow this shape.

```text
docs/prompt_packs/<pack_name>.md
```

Example:

- `docs/prompt_packs/company_filter_v2.md`

Each file should include at least:

- pack purpose
- panel scope
- input contract
- output contract
- keep/drop or scoring rule
- domain definitions
- hard rules
- runtime prompt blocks

## 4. Runtime Rule

Whenever possible, runtime scripts should not hardcode prompts as string constants. They should load them from `docs/prompt_packs/*.md`.

In practice, prompt changes should follow this flow:

1. Update the Markdown prompt pack.
2. Let the script execute by reading that same file.

Additional rules:

- Do not change a prompt pack and then hand-patch only the visible output text.
- Store and reuse summaries, briefings, and digests as generated artifacts from prompt and code.
- If different wording is needed, change the pack version, schema, or selection rule and regenerate under a new `prompt_version`.

## 5. Current Canonical Packs

| Pack | Panel | Use | Code |
|------|-------|-----|------|
| [company_filter_v2](./prompt_packs/company_filter_v2.md) | Company / Release | Keep/drop judgment plus domain classification | `llm_enrich.py` |
| [paper_domain_v1](./prompt_packs/paper_domain_v1.md) | Paper | Classification into 22 research areas | `paper_enrich.py` |

### company_filter_v2

- Classifies `Company / Release` panel candidates independently
- Input: `document_id`, `source`, `title`, optional `desc`
- Output: `decision`, `company_domain`, `reason_code`
- Includes domain-disambiguation rules such as `model_release` vs `technical_research`

### paper_domain_v1

- Classifies arXiv and Hugging Face daily papers by research domain
- Input: `document_id`, `title` (title-only, intentionally lightweight)
- Output: `paper_domain` (one of 22 enums)
- Includes domain-priority rules such as `LLM+agent -> agents`
