"""
Convenience driver — run every V2 transform in dependency order.

Bronze transforms are independent of one another; the parity harness depends
on the techrequest_index Bronze output, so it runs last.

Usage::

    python Practice_Run/run_all.py
    python Practice_Run/run_all.py --skip-parity      # bronze only
    python Practice_Run/run_all.py --only bronze.linked_dossier
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Make the runners importable regardless of how this script is launched.
sys.path.insert(0, str(Path(__file__).resolve().parent / "runners"))

from runners import (  # noqa: E402  (after sys.path tweak)
    run_bronze_techrequest_index,
    run_bronze_dossier_metadata,
    run_bronze_messages_metadata,
    run_bronze_manufacturing_quality_reference,
    run_bronze_linked_dossier,
    run_parity_ufo_entry,
)


STAGES = [
    ("bronze.techrequest_index",              run_bronze_techrequest_index.main),
    ("bronze.dossier_metadata",               run_bronze_dossier_metadata.main),
    ("bronze.messages_metadata",              run_bronze_messages_metadata.main),
    ("bronze.manufacturing_quality_reference",run_bronze_manufacturing_quality_reference.main),
    ("bronze.linked_dossier",                 run_bronze_linked_dossier.main),
    ("parity.ufo_entry",                      run_parity_ufo_entry.main),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--only",
        nargs="*",
        default=None,
        help="Run only the named stage(s). Default: all stages.",
    )
    parser.add_argument(
        "--skip-parity",
        action="store_true",
        help="Run the Bronze stages but skip the parity harness.",
    )
    args = parser.parse_args()

    selected = STAGES
    if args.only:
        wanted = set(args.only)
        selected = [(n, fn) for (n, fn) in STAGES if n in wanted]
        missing = wanted - {n for (n, _) in STAGES}
        if missing:
            raise SystemExit(f"Unknown stage(s): {sorted(missing)}")
    if args.skip_parity:
        selected = [(n, fn) for (n, fn) in selected if not n.startswith("parity")]

    for name, fn in selected:
        print(f"\n===== Running {name} =====")
        fn()


if __name__ == "__main__":
    main()
