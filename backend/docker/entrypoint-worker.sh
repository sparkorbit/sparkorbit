#!/bin/sh
set -eu

export SPARKORBIT_REDIS_URL="${SPARKORBIT_REDIS_URL:-redis://redis:6379/0}"
export SPARKORBIT_WORKER_POLL_INTERVAL="${SPARKORBIT_WORKER_POLL_INTERVAL:-2}"

python3 - <<'PY'
import os
import socket
import time
from urllib.parse import urlparse

from backend.app.core.store import RedisStore
from backend.app.services.session_service import process_enrichment_queue

redis_url = os.environ["SPARKORBIT_REDIS_URL"]
poll_interval = float(os.environ.get("SPARKORBIT_WORKER_POLL_INTERVAL", "2"))
parsed = urlparse(redis_url)
host = parsed.hostname or "redis"
port = parsed.port or 6379

for _ in range(60):
    try:
        with socket.create_connection((host, port), timeout=1):
            break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit("Redis did not become ready in time.")

store = RedisStore(url=redis_url)
while True:
    try:
        process_enrichment_queue(store, once=True)
    except Exception as exc:
        print(f"[worker] {exc}", flush=True)
    time.sleep(poll_interval)
PY
