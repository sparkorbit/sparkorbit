#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_COMPOSE="${ROOT_DIR}/docker-compose.yml"
LLM_COMPOSE="${ROOT_DIR}/docker-compose.llm.yml"

USE_LLM=""
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-llm)    USE_LLM="yes"; shift ;;
    --without-llm) USE_LLM="no";  shift ;;
    *)             EXTRA_ARGS+=("$1"); shift ;;
  esac
done

if [[ -z "${USE_LLM}" ]]; then
  if [[ -t 0 ]]; then
    echo ""
    echo "  Local LLM bundle is recommended and enabled by default."
    echo "  It adds company filter, paper classifier, and daily briefing."
    echo "  Requires: NVIDIA GPU with ~4GB VRAM (6-8GB recommended for full context)"
    echo "  Model: qwen3.5:4b (~3.4GB download)"
    echo ""
    printf "Use local LLM bundle? [Y/n] "
    read -r reply
    case "${reply}" in
      n|N|no|NO) USE_LLM="no"  ;;
      *)         USE_LLM="yes" ;;
    esac
  else
    USE_LLM="yes"
  fi
fi

compose_args=(-f "${BASE_COMPOSE}")
if [[ "${USE_LLM}" == "yes" ]]; then
  compose_args+=(-f "${LLM_COMPOSE}")
fi

echo ""
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║                                                      ║"
echo "  ║   SparkOrbit — AI World Monitor                      ║"
echo "  ║                                                      ║"
echo "  ║   Open your browser now:                             ║"
echo "  ║   → http://localhost:3000                            ║"
echo "  ║                                                      ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo ""
echo "  What happens next:"
echo ""
echo "  1. Building containers      — First run may take 1-2 minutes."
echo "  2. Starting services        — Frontend, Backend, Redis."
if [[ "${USE_LLM}" == "yes" ]]; then
  echo "  3. Downloading LLM model   — qwen3.5:4b (~3.4GB), runs in background."
fi
echo "  4. Collecting source data   — Papers, models, news from 30+ sources."
if [[ "${USE_LLM}" == "yes" ]]; then
  echo "  5. LLM enrichment          — Summarization, paper filtering, briefing."
  echo "                               This runs automatically once the model is ready."
fi
echo ""
echo "  You can open http://localhost:3000 right away."
echo "  The loading screen shows real-time progress as each step completes."
echo ""
if [[ "${USE_LLM}" == "yes" ]]; then
  echo "  [LLM: ON]  AI summary, paper topics, and daily briefing enabled."
else
  echo "  [LLM: OFF] Source curation only. No AI summarization."
  echo "              To enable LLM later: bash scripts/docker-up.sh --with-llm"
fi
echo ""
echo "  Building and starting containers..."
echo ""

docker_cmd=(docker compose "${compose_args[@]}" up --build -d --remove-orphans)
if (( ${#EXTRA_ARGS[@]} > 0 )); then
  docker_cmd+=("${EXTRA_ARGS[@]}")
fi

"${docker_cmd[@]}"

echo ""
echo "  ✓ All containers started successfully."
echo ""
echo "  → http://localhost:3000"
echo ""
