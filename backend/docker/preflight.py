from __future__ import annotations

import os
import socket
import time
from urllib.parse import urlparse


def wait_for_tcp(url: str, *, timeout_seconds: int = 60) -> None:
    parsed = urlparse(url)
    host = parsed.hostname or "127.0.0.1"
    default_port = 443 if parsed.scheme == "rediss" else 6379
    port = parsed.port or default_port

    for _ in range(timeout_seconds):
        try:
            with socket.create_connection((host, port), timeout=1):
                return
        except OSError:
            time.sleep(1)
    raise SystemExit(f"Service at {host}:{port} did not become ready in time.")


def main() -> int:
    redis_url = os.environ.get("SPARKORBIT_REDIS_URL", "redis://redis:6379/0")
    wait_for_tcp(redis_url)
    print("[preflight] Redis ready. Starting backend.", flush=True)
    # Ollama readiness is checked lazily at enrichment time — no blocking here.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
