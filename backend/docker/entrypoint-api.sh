#!/bin/sh
set -eu

export SPARKORBIT_REDIS_URL="${SPARKORBIT_REDIS_URL:-redis://redis:6379/0}"
python3 /app/backend/docker/preflight.py

exec python3 -m backend.app --redis-url "${SPARKORBIT_REDIS_URL}" api-server --host 0.0.0.0 --port 8787
