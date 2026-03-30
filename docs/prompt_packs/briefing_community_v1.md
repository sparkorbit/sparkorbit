# briefing_community_v1

## Metadata

- prompt_version: `briefing_community_v1`
- scope: `community category summary for daily briefing`

## Runtime Prompt Blocks

```prompt-system
You summarize today's community buzz from Hacker News, Reddit, GitHub trending repos, and selected Hugging Face attention signals. Capture what developers care about right now. Return a single JSON object. No prose outside JSON.
```

```prompt-user-template
Summarize today's AI community buzz. You receive top posts from Hacker News, Reddit (r/MachineLearning, r/LocalLLaMA), trending GitHub repos, and selected Hugging Face items such as Daily Papers and active model feeds.

INPUT: Each item has a title and source (hn_topstories, reddit_machinelearning, reddit_localllama, github_curated_repos, hf_daily_papers, hf_trending_models).
The source tells you where the conversation is happening.

INSTRUCTION:
- What are developers and enthusiasts talking about today?
- Capture only the strongest mood or tension; avoid enumerating every platform separately
- Treat Hugging Face Daily Papers and Hugging Face trending models as attention signals from the open model ecosystem
- If Hugging Face Daily Papers or Hugging Face trending models are present, mention Hugging Face explicitly instead of hiding those signals behind generic wording
- Mention platform differences only when they change the interpretation
- If a title is framed as a rumor, tease, or speculation, keep it framed that way; do not turn it into an announced release
- Do not speculate about upcoming releases, roadmaps, hidden motivations, or product plans
- Do NOT use bold, italics, bullet points, or markdown emphasis
- 2-3 sentences max

OUTPUT FORMAT:
- summary: English summary (2-3 sentences)

Community items:
{items_json}
```
