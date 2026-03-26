<p align="center">
  <h1 align="center">🛰️ SparkOrbit 🛰️</h1>
  <p align="center">
    <b><i>✦ No more AI FOMO — orbit the signals that matter ✦</i></b>
  </p>
  <p align="center">
    <b>All the AI info you need — papers, models, benchmarks, and news in one dashboard.</b>
  </p>
  <p align="center">
    Our personal home hackathon result, built with brilliant coding agents — Codex & Claude. Keep going!
  </p>
</p>

<p align="center">
    <a href="https://github.com/sparkorbit/sparkorbit/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat&labelColor=0b100b" alt="License"></a>
    <a href="https://github.com/sparkorbit/sparkorbit/commits/main"><img src="https://img.shields.io/github/last-commit/sparkorbit/sparkorbit?style=flat&color=60b8ff&labelColor=0b100b" alt="Last Commit"></a>
    <img src="https://img.shields.io/badge/Python-3.13-blue?style=flat&labelColor=0b100b" alt="Python">
    <img src="https://img.shields.io/badge/React-19-61dafb?style=flat&labelColor=0b100b" alt="React">
    <img src="https://img.shields.io/badge/Docker-Ready-blue?style=flat&labelColor=0b100b" alt="Docker">
    <img src="https://img.shields.io/badge/Ollama-Local_LLM-c084fc?style=flat&labelColor=0b100b" alt="Ollama">
</p>

<p align="center">
  <a href="./docs/README.md">Documentation</a> · <a href="https://github.com/sparkorbit/sparkorbit/issues">Issues</a> · <a href="#contributing">Contributing</a>
</p>

***

> **Official local support:** Linux and macOS
>
> **Windows:** not officially supported yet

***

## What It Does

**Tired of AI FOMO?** New papers every hour, model drops you missed, benchmark shakeups you heard about too late — stop drowning in tabs. SparkOrbit pulls everything into one screen so you can catch up in a few minutes.

- **Collect** — 30+ sources fetched on demand. Papers, trending models, top stories, company announcements. No API keys, no login.
- **Rank** — every item sorted by what matters: likes, downloads, stars, scores. Not just "newest first."
- **Compare** — AI Model Leaderboard shows LMArena rankings across Text, Code, Vision, Image, Video, and Search side by side.
- **Summarize** — optional local LLM reads everything and generates a daily briefing + paper topic grouping. Runs on your GPU, stays on your machine.
- **One command** — on Linux and macOS, `bash scripts/docker-up.sh` and you're live. Docker handles the rest.
- **Fully open-source** — run it, fork it, extend it. Add your own sources. Make the orbit wider.

***

## With GPU vs Without GPU

> **GPU available** — full experience with AI-generated summaries, paper domain grouping, and daily briefing.

<p align="center">
  <img src="./docs/images/AIorbits_comp.png" alt="SparkOrbit with GPU — full AI features" width="100%"/>
</p>

> **No GPU** — you still get the complete dashboard with 30+ sources, leaderboards, and engagement rankings. LLM features are simply skipped.

<p align="center">
  <img src="./docs/images/AIOribits_NoGPU.png" alt="SparkOrbit without GPU — source curation only" width="100%"/>
</p>

***

## Quick Start (Linux/macOS)

Windows is not officially supported yet.

```bash
git clone https://github.com/sparkorbit/sparkorbit.git
cd sparkorbit
bash scripts/docker-up.sh
```

The script asks one question:

```
Use local LLM bundle? [Y/n]
```

| Answer | What you get | Requirements |
|--------|-------------|--------------|
| **Y** (default) | Full experience — AI summary, paper topics, daily briefing | NVIDIA GPU, ~13GB VRAM |
| **N** | Source curation only, no AI summarization | Docker only |

Then open **http://localhost:3000** — the loading screen shows live progress.
If you're running on a remote server, use `http://<server-ip>:3000` instead.

> **No GPU?** No problem. Choose `N` and you still get the full dashboard with 30+ sources, leaderboards, and engagement rankings. LLM features are additive — the core experience works without them.

> **Reload anytime** — click the `RELOAD` button (top-right) to re-collect all sources and re-run LLM features without restarting containers.

```bash
# skip the prompt
bash scripts/docker-up.sh --with-llm      # always include LLM
bash scripts/docker-up.sh --without-llm   # always skip LLM
```

***

## Tech Stack & Documentation

React + FastAPI + Redis + Docker Compose — with optional local LLM via Ollama.

Full tech stack details and all technical docs: **[docs/README.md](./docs/README.md)**

***

## Contributors

<p align="center">Built with caffeine and curiosity by:</p>

<div align="center">
<table>
  <tr>
    <td align="center" width="160">
      <a href="https://github.com/dlsghks1227">
        <img src="https://github.com/dlsghks1227.png" width="80" alt="Inhwan"/>
      </a><br/>
      <b>Inhwan</b><br/>
      <sub>@dlsghks1227</sub>
    </td>
    <td align="center" width="160">
      <a href="https://github.com/jjunsss">
        <img src="https://github.com/jjunsss.png" width="80" alt="jjunsss"/>
      </a><br/>
      <b>jjunsss</b><br/>
      <sub>@jjunsss · <a href="https://jjunsss.github.io/">BLOG</a></sub>
    </td>
  </tr>
</table>
</div>

<p align="center">We'd love more observers in this orbit — whether it's adding a new source adapter, improving the UI, or fixing a typo.</p>

<p align="center"><b>More orbits, wider coverage. Join us.</b></p>

***

## Contributing

> **PR and Contributing Process docs — TBD.**

For now: fork, branch, PR. We'll review and merge.

Coding agents (Codex, Claude, Cursor, etc.) are absolutely welcome — this project was built with them, after all. 🤖

Got ideas or questions? [Open an issue](https://github.com/sparkorbit/sparkorbit/issues). We're friendly.

***

## Known Issues

- **LLM processing can be unstable** — local LLM summarization (Ollama) may occasionally fail or produce unexpected results depending on your GPU, available VRAM, and model load. If it hangs or errors out, try reloading or restarting with `--without-llm`. The core dashboard works fine without it. We're actively checking and improving stability on this.

***

<details>
<summary><b>What can I search to find this project?</b></summary>
<br/>

SparkOrbit is an **AI dashboard**, **AI news aggregator**, **arxiv paper tracker**, **HuggingFace trending viewer**, **LLM leaderboard dashboard**, and **AI research feed reader**.

If you searched for any of these, you're in the right place:

`ai dashboard` · `ai monitor` · `ai news aggregator` · `arxiv paper tracker` · `huggingface trending` · `llm leaderboard` · `ai research feed` · `machine learning news` · `deep learning dashboard` · `ai info dashboard` · `paper summarizer` · `model ranking` · `ai tool` · `open source ai dashboard` · `ollama dashboard` · `lmarena` · `ai benchmark tracker` · `nlp news` · `computer vision papers` · `ai community feed`

</details>

***

<p align="center">
  <i>For the AI orbit.</i> 🛰️
</p>
