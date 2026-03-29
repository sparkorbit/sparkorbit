#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_COMPOSE="${ROOT_DIR}/docker-compose.yml"
LLM_COMPOSE="${ROOT_DIR}/docker-compose.llm.yml"
MODE_FILE="${ROOT_DIR}/.sparkorbit-mode"

cd "${ROOT_DIR}"

if [[ ! -f "${MODE_FILE}" ]]; then
  echo ""
  echo "  No previous session found."
  echo "  Run 'bash scripts/docker-up.sh' for first-time setup."
  exit 1
fi

USE_LLM="$(cat "${MODE_FILE}")"
if [[ "${USE_LLM}" != "yes" && "${USE_LLM}" != "no" ]]; then
  echo ""
  echo "  Invalid saved mode. Run 'bash scripts/docker-up.sh' instead."
  exit 1
fi

compose_args=(-f "${BASE_COMPOSE}")
if [[ "${USE_LLM}" == "yes" ]]; then
  compose_args+=(-f "${LLM_COMPOSE}")
fi

if [[ "${USE_LLM}" == "yes" ]]; then
  echo "  Updating SparkOrbit [LLM: ON] ..."
else
  echo "  Updating SparkOrbit [LLM: OFF] ..."
fi
echo ""

docker compose "${compose_args[@]}" up --build -d --remove-orphans

echo ""
echo "  ✓ Update complete."
echo "  → http://localhost:3000"
echo "  → http://<server-ip>:3000"
echo ""
