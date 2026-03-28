#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_COMPOSE="${ROOT_DIR}/docker-compose.yml"
LLM_COMPOSE="${ROOT_DIR}/docker-compose.llm.yml"

cd "${ROOT_DIR}"
docker compose -f "${BASE_COMPOSE}" -f "${LLM_COMPOSE}" down --remove-orphans "$@"
