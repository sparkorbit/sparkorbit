#!/bin/sh
set -eu

export SPARKORBIT_REDIS_URL="${SPARKORBIT_REDIS_URL:-redis://redis:6379/0}"

python3 - <<'PY'
import os
import socket
import time
from urllib.parse import urlparse

redis_url = os.environ["SPARKORBIT_REDIS_URL"]
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
PY

exec python3 -m backend.app --redis-url "${SPARKORBIT_REDIS_URL}" api-server --host 0.0.0.0 --port 8787
