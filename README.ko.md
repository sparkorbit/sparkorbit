<h1 align="center">🛰️ SparkOrbit 🛰️</h1>
<p align="center">
  <img src="./docs/images/SparKOrbit.png" alt="SparkOrbit" width="300"/><br/>
  <b><i>✦ AI FOMO는 이제 그만 — 중요한 시그널만 궤도에서 포착하세요 ✦</i></b><br/>
  <b>논문, 모델, 벤치마크, 뉴스 — AI 정보를 하나의 대시보드에서.</b><br/>
  <sub>집에서 진행한 개인 해커톤 결과물입니다. Codex & Claude와 함께 만들었습니다. Keep going!</sub>
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
  <a href="./docs/README.ko.md">문서</a> · <a href="https://github.com/sparkorbit/sparkorbit/issues">이슈</a> · <a href="#contributing">기여하기</a>
</p>

<p align="center">
  <a href="./README.md">🇺🇸 English</a> · <a href="./README.ko.md">🇰🇷 한국어</a>
</p>

<p align="center">
  <img src="./docs/images/AIorbits_comp.png" alt="SparkOrbit 대시보드 — LLM 포함 전체 기능" width="100%"/>
</p>
- 프로젝트 화면

***

> **테스트 완료:** Linux, macOS, Windows 모두 확인했습니다.
> Docker/WSL 환경에 따라 예외가 있을 수 있습니다 — [Known Issues](#known-issues) 참고
>
> **설치 없이 사용하고 싶습니다:** 브라우저에서 바로 체험할 수 있는 데모 서버를 검토 중입니다. 아직 확정은 아닙니다.

***

## What It Does - 해당 프로젝트가 제공하는 것

**AI [FOMO(Fear Of Missing Out)](https://en.wikipedia.org/wiki/Fear_of_missing_out)에 지치셨나요?** 매시간 쏟아지는 논문, 놓친 모델 릴리스, 다수의 Big-Tech에서 공개하는 신기술, 뒤늦게 알게 된 벤치마크 변동 — 무수히 많은 탭 지옥에서 벗어나세요. SparkOrbit이 모든 정보를 한 화면에 모아서 몇 분 만에 훑어볼 수 있게 해드립니다. 정보의 호수에 빠져보세요! 

- **수집** — 40개 이상의 소스를 한 번에 가져옵니다. 논문, 인기 모델, 주요 뉴스, 기업 발표 및 소식까지. 사용자에게 요구하는 API 키도, 로그인도 없습니다.
- **랭킹** — 좋아요, 다운로드, 별점, 스코어 기준으로 정렬합니다. 단순히 "최신순"이 아닙니다.
- **비교** — AI 모델 리더보드에서 Text, Code, Vision, Image, Video, Search 분야의 다양한 최신 랭킹을 한눈에 비교합니다. (**매번 SoTA를 찾느라 고생하지 마세요**.)
- **요약** — 로컬 LLM (QWEN 3.5 4B)이 모든 내용을 읽고 데일리 브리핑과 논문 주제 분류를 생성합니다. GPU에서 돌아가고, 데이터는 내 컴퓨터에 남습니다.
- **한 줄이면 끝** — `bash scripts/docker-up.sh`만 실행하면 됩니다. `--with-llm`으로 GPU AI 기능 포함, `--without-llm`으로 건너뛰기. 나머지는 Docker가 알아서 합니다.
- **완전 오픈소스** — 실행하고, 포크하고, 확장하세요. 새로운 소스를 추가해서 저희와 함께 정보의 궤도를 넓혀보세요.



***

## Quick Start

세 줄이면 됩니다.

```bash
git clone https://github.com/sparkorbit/sparkorbit.git
cd sparkorbit
bash scripts/docker-up.sh
```

**주의**  

> ⚠️ Docker가 없으면 스크립트가 먼저 현재 환경을 확인한 뒤, 설치를 도와주는 안내를 제공합니다.
>
> **⚠️ `Use local LLM bundle? [Y/n]`** — AI 요약 기능의 사용 여부를 결정합니다. 본인의 장비에 맞춰 사용하세요. LLM을 사용하기 위해서는 local GPU가 필요합니다.

| 선택 | 제공되는 기능 | 요구 사항 |
|------|-------------|-----------|
| **Y** (기본값) | 전체 기능 — 오늘 집중할 소식 요약, 논문 핵심 주제 분류 등 | NVIDIA GPU, ~13GB VRAM |
| **N** | 소스 큐레이션만 제공, 요약 없음 | Docker|

GPU가 없어도 괜찮습니다 — `N`을 선택하면 40개 이상의 소스, 리더보드, 인기 순위를 모두 볼 수 있습니다. AI 기능은 추가 옵션이지, 필수가 아닙니다. 없어도 광활한 정보의 호수를 탐험할 수 있습니다.

실행이 끝나면 **http://localhost:3000**을 열어보세요. 원격 서버로 접속한다면 서버 IP로 대체하여 접속할 수 있습니다.

<details>
<summary><b>스크린샷: GPU 있음 (전체 AI 기능)</b></summary>
<br/>
<p align="center">
  <img src="./docs/images/AIorbits_comp.png" alt="SparkOrbit GPU 사용 — 전체 AI 기능" width="100%"/>
</p>
</details>

<details>
<summary><b>스크린샷: GPU 없음 (소스 큐레이션만)</b></summary>
<br/>
<p align="center">
  <img src="./docs/images/AIOribits_NoGPU.png" alt="SparkOrbit GPU 미사용 — 소스 큐레이션만" width="100%"/>
</p>
</details>

***

## Features (부가 기능)

1. <img src="https://img.shields.io/badge/Normal-blue" height="20"/> — 오른쪽 상단의 **RELOAD** 버튼을 누르면 모든 소스를 다시 수집하고 LLM 기능을 재실행합니다. 소스들은 매일 새로운 데이터를 공개하므로, **날짜가 바뀌면 반드시 RELOAD를 눌러 최신 데이터로 갱신하세요.**

2. <img src="https://img.shields.io/badge/Normal-blue" height="20"/> -- Side Panel의 Manage Panels을 활용하여 확인하고 싶은 정보들만 선택하거나 패널 노출의 순서를 제어할 수 있습니다.

3. <img src="https://img.shields.io/badge/LLM-purple" height="20"/> -- LLM processing 이후 pop-up 창이 자동으로 뜨게 되고, 확인시에 summary, arxiv domain 정리 그리고 Side Panel의 paper에도 domain sub-title이 노출됩니다.

***

## Tech Stack & Documentation

전체 기술 스택 및 문서는 **[docs/README.md](./docs/README.md)** 에 정리됩니다.

***

## Contributors

<p align="center">엄청난 양의 카페인과 호기심으로 만들었습니다:</p>

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

<p align="center">새로운 소스 어댑터 추가, UI 개선, 오타 수정 — 어떤 기여든 환영합니다.</p>

<p align="center"><b>궤도가 넓어질수록, 더 많은 것이 보입니다. 함께해 주세요.</b></p>

***

## Contributing

> **PR 및 기여 프로세스 문서 — 준비 중입니다.**

- 지금은 fork → branch → PR 방식으로 진행해 주세요. 리뷰 후 머지하겠습니다. 

- 어떠한 코딩 에이전트(Codex, Claude, Cursor 등) 사용도 환영합니다 — 이 프로젝트 자체가 그렇게 만들어졌으니까요.:) 
아이디어나 질문이 있으시면 [이슈를 열어주세요](https://github.com/sparkorbit/sparkorbit/issues). 편하게 남겨주시면 됩니다.

***

## Known Issues

- **LLM 처리가 불안정할 수 있습니다** — Ollama 기반 로컬 LLM 요약은 GPU, VRAM 상태, 모델 로딩에 따라 실패하거나 예상치 못한 결과를 낼 수 있습니다. 멈추거나 에러가 나면 실행중이던 도커를 지우고 `bash scripts/docker-up.sh --without-llm`으로 재시작해 보세요. 핵심 대시보드는 LLM 없이도 정상 작동합니다. 지속적으로 안정성을 개선하고 있습니다.
- **크로스 플랫폼 예외** — Linux, macOS, Windows 모두 테스트했습니다. 기본적으로 잘 동작하지만 Docker 버전, WSL 설정, 네트워크 환경에 따라 예기치 않은 에러가 발생할 수 있습니다. 문제가 생기면 [이슈를 열어주세요](https://github.com/sparkorbit/sparkorbit/issues) — 알려주시면 빠르게 대응하겠습니다.

***

<details>
<summary><b>이 프로젝트를 찾기 위해 뭘 검색하면 될까요?</b></summary>
<br/>

SparkOrbit은 **AI 대시보드**, **AI 뉴스 수집기**, **arXiv 논문 트래커**, **HuggingFace 트렌딩 뷰어**, **LLM 리더보드 대시보드**, **AI 연구 피드 리더**입니다.

아래 키워드로 검색해서 찾아오셨다면, 잘 오셨습니다:

`ai dashboard` · `ai monitor` · `ai news aggregator` · `arxiv paper tracker` · `huggingface trending` · `llm leaderboard` · `ai research feed` · `machine learning news` · `deep learning dashboard` · `ai info dashboard` · `paper summarizer` · `model ranking` · `ai tool` · `open source ai dashboard` · `ollama dashboard` · `lmarena` · `ai benchmark tracker` · `nlp news` · `computer vision papers` · `ai community feed`

</details>

***

## Acknowledgments

- [**WorldMonitor**](https://github.com/koala73/worldmonitor) — 올인원 모니터링 대시보드라는 아이디어에 영감을 준 프로젝트입니다. SparkOrbit은 이 컨셉을 AI 분야로 가져오면서 시작되었습니다.

***

<p align="center">
  <i>For the AI orbit.</i> 🛰️
</p>
