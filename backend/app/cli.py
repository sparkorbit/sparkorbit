from __future__ import annotations

import argparse
import json

from .core.constants import (
    DEFAULT_API_HOST,
    DEFAULT_API_PORT,
    DEFAULT_COLLECTION_PROFILE,
    DEFAULT_REDIS_URL,
    DEFAULT_RUN_LABEL,
)
from .core.store import RedisStore
from .main import serve
from .services.session_service import (
    process_enrichment_queue,
    publish_run,
    reload_session,
    run_session_enrichment,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="SparkOrbit backend runtime tools.")
    parser.add_argument("--redis-url", default=DEFAULT_REDIS_URL, help="Redis connection URL.")

    subparsers = parser.add_subparsers(dest="command", required=True)

    api_parser = subparsers.add_parser("api-server", help="Run the backend API server.")
    api_parser.add_argument("--host", default=DEFAULT_API_HOST)
    api_parser.add_argument("--port", type=int, default=DEFAULT_API_PORT)

    publish_parser = subparsers.add_parser("publish", help="Publish an existing run directory into Redis.")
    publish_parser.add_argument("--run-dir", required=True)
    publish_parser.add_argument("--no-queue", action="store_true")

    summarize_parser = subparsers.add_parser("summarize", help="Run document summaries and digests.")
    summarize_parser.add_argument("--session-id")
    summarize_parser.add_argument("--once", action="store_true")

    reload_parser = subparsers.add_parser("reload", help="Collect, publish, and queue a new session.")
    reload_parser.add_argument("--profile", default=DEFAULT_COLLECTION_PROFILE)
    reload_parser.add_argument("--limit", type=int)
    reload_parser.add_argument("--run-label", default=DEFAULT_RUN_LABEL)
    reload_parser.add_argument("--timeout", type=float, default=30.0)
    reload_parser.add_argument("--source", dest="sources", action="append")
    reload_parser.add_argument("--no-queue", action="store_true")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    store = RedisStore(url=args.redis_url)

    if args.command == "api-server":
        serve(host=args.host, port=args.port, redis_url=args.redis_url)
        return 0

    if args.command == "publish":
        result = publish_run(store, args.run_dir, queue=not args.no_queue)
        print(json.dumps(result["meta"], ensure_ascii=False, indent=2))
        return 0

    if args.command == "summarize":
        if args.session_id:
            result = run_session_enrichment(store, args.session_id)
            print(json.dumps(result["meta"], ensure_ascii=False, indent=2))
            return 0
        processed = process_enrichment_queue(store, once=args.once)
        print(json.dumps([item["meta"] for item in processed], ensure_ascii=False, indent=2))
        return 0

    if args.command == "reload":
        result = reload_session(
            store,
            sources=args.sources,
            profile=args.profile,
            limit=args.limit,
            run_label=args.run_label,
            timeout=args.timeout,
            queue=not args.no_queue,
        )
        print(json.dumps(result["meta"], ensure_ascii=False, indent=2))
        return 0

    parser.error(f"Unknown command: {args.command}")
    return 2
