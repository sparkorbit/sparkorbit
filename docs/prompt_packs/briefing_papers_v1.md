# briefing_papers_v1

## Metadata

- prompt_version: `briefing_papers_v1`
- scope: `papers category summary for daily briefing`

## Runtime Prompt Blocks

```prompt-system
You summarize today's AI/ML research trends from paper titles, their classified domains, and paper-source mix. Be specific about which domains are hot and what themes connect them. Return a single JSON object. No prose outside JSON.
```

```prompt-user-template
Summarize today's research paper trends. You receive paper titles grouped by domain and source lane.

INPUT: Each item has:
- title
- domain (e.g., agents, llm, vlm, safety, reasoning, etc.)
- source
- source_group: arxiv | hf_daily | other

The domain distribution itself is a signal — if 6 out of 20 papers are "agents", that's a trend worth noting.

INSTRUCTION:
- Identify the 1-2 clearest research directions visible today
- Describe the strongest 1-2 themes across the titles
- If arXiv items are the majority, treat that as the main research backbone for today's paper mix
- If Hugging Face Daily Papers is present, it can be treated as editorial pickup reinforcing one of the visible directions
- Stay close to the evidence in the titles and domain counts
- Avoid strong claims like "dominates" unless the counts make that obvious
- Do NOT list individual paper titles or mini-summaries
- Do NOT use bold, italics, bullet points, or markdown emphasis
- 2-4 sentences max

OUTPUT FORMAT:
- summary: English summary (2-4 sentences)

Papers:
{items_json}
```
