<h1 align="center">🛰️ SparkOrbit 🛰️</h1>
<p align="center">
  <img src="./docs/images/SparKOrbit.png" alt="SparkOrbit" width="300"/><br/>
  <b><i>✦ No more AI FOMO — orbit the signals that matter ✦</i></b><br/>
  <b>All the AI info you need — papers, models, benchmarks, and news in one dashboard.</b><br/>
  <sub>Our personal home hackathon result, built with brilliant coding agents — Codex & Claude. Keep going!</sub>
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

<p align="center">
  <a href="./README.md">🇺🇸 English</a> · <a href="./README.ko.md">🇰🇷 한국어</a>
</p>

<p align="center">
  <img src="./docs/images/AIorbits_comp.png" alt="SparkOrbit dashboard — full AI features" width="100%"/>
</p>
-- Project snapshot 

***

> **Tested on:** Linux and macOS. Windows is partially tested (via WSL).
> Edge cases may exist depending on Docker/WSL setup — see [Known Issues](#known-issues)
>
> **Don't want to install?** We're considering a live demo server so you can try SparkOrbit right from your browser. No promises yet — stay tuned.

***

## 🔭 What It Does

**Tired of AI [FOMO (Fear Of Missing Out)](https://en.wikipedia.org/wiki/Fear_of_missing_out)?** New papers every hour, model drops you missed, benchmark shakeups you heard about too late — stop drowning in tabs. SparkOrbit pulls everything into one screen so you can catch up in a few minutes.

- **Collect** — 40+ sources fetched on demand. Papers, trending models, top stories, company announcements and updates. No API keys, no login required.
- **Rank** — every item sorted by what matters: likes, downloads, stars, scores. Not just "newest first."
- **Compare** — AI Model Leaderboard shows the latest rankings across Text, Code, Vision, Image, Video, and Search side by side. **No more hunting for the current SoTA**.
- **Summarize** — local LLM (Qwen 3.5 4B) reads everything and generates a daily briefing + paper topic grouping. Runs on your GPU, stays on your machine.
- **One command** — Just all-in-one command. Docker handles the rest.
- **Fully open-source** — run it, fork it, extend it. Add your own sources and widen the orbit with us.



***

## 🚀 Quick Start

Three lines. That's it.

```bash
git clone https://github.com/sparkorbit/sparkorbit.git
cd sparkorbit
bash scripts/docker-up.sh
```

**Note**

> ⚠️ If Docker is missing, the script checks your environment first and offers guided installation help before continuing.
>
> **⚠️ `Use local LLM bundle? [Y/n]`** — This decides whether AI summarization runs on your machine. Choose based on your hardware. A local GPU is required for LLM features.

| Answer | What you get | Requirements |
|--------|-------------|--------------|
| **Y** (default) | Full experience — daily briefing, paper topic grouping, and more | NVIDIA GPU, ~13GB VRAM |
| **N** | Source curation only, no summarization | Docker |

- No GPU? No problem — pick `N` and you still get the full dashboard with 40+ sources, leaderboards, and engagement rankings. AI features are a bonus, not a requirement.

- Once it's up, open **http://localhost:3000**. On a remote server, replace localhost with your server IP.

<details>
<summary><b>Screenshot: With GPU (full AI features)</b></summary>
<br/>
<p align="center">
  <img src="./docs/images/AIorbits_comp.png" alt="SparkOrbit with GPU — full AI features" width="100%"/>
</p>
</details>

<details>
<summary><b>Screenshot: Without GPU (source curation only)</b></summary>
<br/>
<p align="center">
  <img src="./docs/images/AIOribits_NoGPU.png" alt="SparkOrbit without GPU — source curation only" width="100%"/>
</p>
</details>

<br>

**Stopping**

```bash
bash scripts/docker-down.sh
```

When you're done, stop the containers and start them again next time with `docker-up.sh`. Keeping them running wastes resources when you're not using the dashboard.

**Updating**

```bash
git pull
bash scripts/docker-up.sh
```

If some time has passed since your last session, pull before starting up — updates can land at any time. The app runs from Docker images, so you need to re-run `docker-up.sh` after pulling for updating configuations.

***

## ✨ Features

1. <img src="https://img.shields.io/badge/Normal-blue" height="16"/> — Hit the **RELOAD** button (top-right) to re-collect all sources and re-run LLM features. Sources publish new data every day, so **we strongly recommend reloading at least once a day** to stay current.

2. <img src="https://img.shields.io/badge/Normal-blue" height="16"/> — Use **Manage Panels** in the Side Panel to select which information to display and control the panel order.

3. <img src="https://img.shields.io/badge/LLM-purple" height="16"/> — After LLM processing completes, a pop-up appears automatically. On confirmation, you'll see the summary, arxiv domain grouping, and domain sub-titles in the Side Panel's paper section.

***

## 🧩 Tech Stack & Documentation

Full tech stack details and all technical docs: **[docs/README.md](./docs/README.md)**

***

## 👥 Contributors

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

## 🤝 Contributing

> **PR and Contributing Process docs — TBD.**

- For now: fork, branch, PR. We'll review and merge.

- Coding agents (Codex, Claude, Cursor, etc.) are absolutely welcome — this project was built with them, after all. Got ideas or questions? [Open an issue](https://github.com/sparkorbit/sparkorbit/issues). We're friendly.

***

## ⚠️ Known Issues

- **LLM processing can be unstable** — local LLM summarization (Ollama) may occasionally fail or produce unexpected results depending on your GPU, available VRAM, and model load. If it hangs or errors out, try reloading or restarting with `bash scripts/docker-up.sh --without-llm`. The core dashboard works fine without it. We're actively checking and improving stability on this.
- **Cross-platform edge cases** — fully tested on Linux and macOS. Windows support is partial (WSL only) — depending on your Docker version, WSL configuration, or network setup, unexpected errors may occur. If you run into any issues, please [open an issue](https://github.com/sparkorbit/sparkorbit/issues) — we want to know about it.

***

<details>
<summary><b>What can I search to find this project?</b></summary>
<br/>

SparkOrbit is an **AI dashboard**, **AI news aggregator**, **arxiv paper tracker**, **HuggingFace trending viewer**, **LLM leaderboard dashboard**, and **AI research feed reader**.

If you searched for any of these, you're in the right place:

`ai dashboard` · `ai monitor` · `ai news aggregator` · `arxiv paper tracker` · `huggingface trending` · `llm leaderboard` · `ai research feed` · `machine learning news` · `deep learning dashboard` · `ai info dashboard` · `paper summarizer` · `model ranking` · `ai tool` · `open source ai dashboard` · `ollama dashboard` · `lmarena` · `ai benchmark tracker` · `nlp news` · `computer vision papers` · `ai community feed`

</details>

***

## 🙏 Acknowledgments

- [**WorldMonitor**](https://github.com/koala73/worldmonitor) — the original inspiration for building an all-in-one monitoring dashboard. SparkOrbit started from the idea of bringing that concept into the AI space.

***

<p align="center">
  <i>For the AI orbit.</i> 🛰️
</p>
