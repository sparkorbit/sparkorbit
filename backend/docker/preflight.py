from __future__ import annotations

import json
import os
import socket
import time
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen


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


def should_wait_for_ollama() -> bool:
    providers = {
        (os.environ.get("SPARKORBIT_BRIEFING_PROVIDER") or "").strip().lower(),
        (os.environ.get("SPARKORBIT_SUMMARY_PROVIDER") or "").strip().lower(),
    }
    return "ollama" in providers


def wait_for_ollama_model(
    base_url: str, model_name: str, *, timeout_seconds: int = 600
) -> bool:
    endpoint = f"{base_url.rstrip('/')}/api/tags"
    deadline = time.time() + timeout_seconds

    while time.time() < deadline:
        try:
            with urlopen(endpoint, timeout=3) as response:
                payload = json.load(response)
            models = payload.get("models") or []
            names = {
                str(entry.get("name") or "").strip()
                for entry in models
                if isinstance(entry, dict)
            }
            if model_name in names:
                return True
        except (OSError, URLError, ValueError, json.JSONDecodeError):
            pass
        time.sleep(2)

    return False


def main() -> int:
    redis_url = os.environ.get("SPARKORBIT_REDIS_URL", "redis://redis:6379/0")
    wait_for_tcp(redis_url)

    if should_wait_for_ollama():
        base_url = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")
        model_name = os.environ.get("OLLAMA_MODEL", "qwen3.5:4b")
        ready = wait_for_ollama_model(base_url, model_name)
        if not ready:
            print(
                f"[preflight] Ollama model '{model_name}' is not ready at {base_url}; "
                "continuing without blocking startup.",
                flush=True,
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
