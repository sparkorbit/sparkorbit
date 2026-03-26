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

docker compose "${compose_args[@]}" up --build -d --remove-orphans "${EXTRA_ARGS[@]}"

echo ""
echo "  SparkOrbit is starting up."
echo ""
echo "  Frontend:  http://localhost:3000   ← open this now"
echo "  Backend:   http://localhost:8787"
if [[ "${USE_LLM}" == "yes" ]]; then
  echo "  Ollama:    http://localhost:11434  (model downloading in background)"
fi
echo ""
echo "  Data collection starts immediately."
if [[ "${USE_LLM}" == "yes" ]]; then
  echo "  LLM enrichment + briefing will run automatically once the model is ready."
else
  echo "  Started without the local LLM bundle."
fi
