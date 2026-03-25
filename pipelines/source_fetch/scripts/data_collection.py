from __future__ import annotations

import argparse
import json
from pathlib import Path

from source_fetch.pipeline import run_collection


BASE_DIR = Path(__file__).resolve().parent.parent


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Readable end-to-end source collection flow for SparkOrbit.")
    parser.add_argument(
        "--sources",
        nargs="*",
        default=["all"],
        help="Source names to fetch. Default: all",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max items per source. Default: 20.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(BASE_DIR / "data" / "runs"),
        help="Run output root. Default: pipelines/source_fetch/data/runs",
    )
    parser.add_argument(
        "--run-label",
        default="data-collection",
        help="Human-friendly suffix for run_id. Default: data-collection",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="HTTP timeout seconds. Default: 30",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    run_manifest, run_dir = run_collection(
        sources=args.sources,
        limit=args.limit,
        output_dir=args.output_dir,
        run_label=args.run_label,
        timeout=args.timeout,
    )
    print(json.dumps(run_manifest, ensure_ascii=False, indent=2))
    print(f"Run output: {run_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
