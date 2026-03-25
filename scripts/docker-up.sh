#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_COMPOSE="${ROOT_DIR}/docker-compose.yml"
LLM_COMPOSE="${ROOT_DIR}/docker-compose.llm.yml"

USE_LLM=""

if [[ "${1:-}" == "--with-llm" ]]; then
  USE_LLM="yes"
elif [[ "${1:-}" == "--without-llm" ]]; then
  USE_LLM="no"
fi

if [[ -z "${USE_LLM}" ]]; then
  if [[ -t 0 ]]; then
    printf "Include local LLM bundle (Ollama + qwen3.5:4b)? [y/N] "
    read -r reply
    case "${reply}" in
      y|Y|yes|YES)
        USE_LLM="yes"
        ;;
      *)
        USE_LLM="no"
        ;;
    esac
  else
    USE_LLM="no"
  fi
fi

compose_args=(-f "${BASE_COMPOSE}")
if [[ "${USE_LLM}" == "yes" ]]; then
  compose_args+=(-f "${LLM_COMPOSE}")
  echo "Starting SparkOrbit with local LLM bundle."
else
  echo "Starting SparkOrbit without local LLM bundle."
fi

docker compose "${compose_args[@]}" up --build
