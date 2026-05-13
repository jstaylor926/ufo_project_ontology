"""
Local runner — ``v2_parity.parity_ufo_entry``.

Compares a V1 UfoEntry snapshot (``Data/tr_v1.csv``) against the V2 Bronze
techrequest_index parquet produced by ``run_bronze_techrequest_index.py``.

Outputs two parquet datasets:

* ``Practice_Run/output/parity_ufo_entry_diff/``    — long-form per-field diff
* ``Practice_Run/output/parity_ufo_entry_summary/`` — per-field match stats

Run order::

    python Practice_Run/runners/run_bronze_techrequest_index.py
    python Practice_Run/runners/run_parity_ufo_entry.py
"""

from __future__ import annotations

import uuid

from _common import bootstrap_paths, get_local_spark, write_parquet

bootstrap_paths()

from config import dataset_path, ensure_output_dir  # noqa: E402
from v2_parity._parity_utils import (  # noqa: E402
    JOIN_KEY,
    build_diff,
    build_summary,
    held_out_sample,
)


def main(sample: bool = True) -> None:
    """Run the parity harness.

    Parameters
    ----------
    sample
        If True (default), restrict to the same hash-bucket sample the
        Foundry-side harness uses. Set False to run over the whole input.
    """
    ensure_output_dir()
    spark = get_local_spark("UFO-V2-Parity-UfoEntry")

    # The Bronze parquet is produced by run_bronze_techrequest_index.py — run
    # that first if you see "Path does not exist" here.
    v2 = spark.read.parquet(str(dataset_path("v2.bronze.techrequest_index")))

    # V1 source: tr_v1.csv. The V1 transform stores the internal id under
    # `Internal_Id`; the parity harness expects it under `dossier_internal_id`.
    v1 = spark.read.option("header", "true").option("multiLine", "true").option(
        "escape", '"'
    ).csv(str(dataset_path("v1.ufo_entry")))
    if "Internal_Id" in v1.columns and JOIN_KEY not in v1.columns:
        v1 = v1.withColumnRenamed("Internal_Id", JOIN_KEY)

    if sample:
        v1 = held_out_sample(v1)
        v2 = held_out_sample(v2)

    run_id = str(uuid.uuid4())
    diff = build_diff(v1, v2, run_id=run_id)
    summary = build_summary(diff, run_id=run_id)

    diff_sink = write_parquet(diff, dataset_path("parity.ufo_entry_diff"))
    summary_sink = write_parquet(summary, dataset_path("parity.ufo_entry_summary"))

    print(f"[parity.ufo_entry_diff]    rows={diff.count()} -> {diff_sink}")
    print(f"[parity.ufo_entry_summary] rows={summary.count()} -> {summary_sink}")
    print(f"[parity.ufo_entry] run_id={run_id}")


if __name__ == "__main__":
    main()
