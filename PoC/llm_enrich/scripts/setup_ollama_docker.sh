#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.ollama.yml"
CONTAINER_NAME="${OLLAMA_CONTAINER_NAME:-sparkorbit-ollama}"
MODEL="${OLLAMA_MODEL:-qwen3.5:4b}"
BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed or not in PATH" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

echo "Starting Ollama container..."
docker compose -f "${COMPOSE_FILE}" up -d

echo "Waiting for Ollama API at ${BASE_URL} ..."
for _ in $(seq 1 60); do
  if curl -fsS "${BASE_URL}/api/tags" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -fsS "${BASE_URL}/api/tags" >/dev/null 2>&1; then
  echo "Ollama did not become ready in time" >&2
  exit 1
fi

echo "Pulling model ${MODEL} ..."
docker exec "${CONTAINER_NAME}" ollama pull "${MODEL}"

echo "Installed models:"
curl -fsS "${BASE_URL}/api/tags"
echo
echo "Ollama is ready."
