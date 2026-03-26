# briefing_models_v1

## Metadata

- prompt_version: `briefing_models_v1`
- scope: `models category summary for daily briefing`

## Runtime Prompt Blocks

```prompt-system
You summarize today's Hugging Face model signals. Distinguish current hype and brand-new uploads. Return a single JSON object. No prose outside JSON.
```

```prompt-user-template
Summarize today's model attention. You receive model titles with source lane and ranking signals.

INPUT: Each item has:
- title
- source: hf_trending_models | hf_models_new
- likes
- downloads
- feed_score
- signal_reason: fresh_and_hot | hot_now | evergreen | recent
- discovery_reason: trending_feed | new_model_feed | established | etc.
- freshness: just_now | new | active | established
- trend_rank (when source is hf_trending_models)

INSTRUCTION:
- Prioritize source lane and signal fields over raw likes when describing what is hot today
- Distinguish clearly between:
  1. today’s hype from hf_trending_models
  2. brand-new uploads from hf_models_new
- Use model names cautiously; do not infer capabilities that are not directly supported by the source lane and signal metadata
- Title tokens such as reasoning, distilled, opus, coder, or vision are naming clues, not proof of actual capability
- Likes and downloads indicate attention, not quality or benchmark superiority
- Focus on the overall feed pattern rather than listing multiple model names
- Prefer wording like "today's attention is concentrated in the trending feed" or "fresh uploads are active today"
- Do not explain why a model is good, strong, specialized, or superior unless that fact is explicit in the provided fields
- Do NOT use bold, italics, bullet points, or markdown emphasis
- 2-3 sentences max

OUTPUT FORMAT:
- summary: English summary (2-3 sentences)

Models:
{items_json}
```
