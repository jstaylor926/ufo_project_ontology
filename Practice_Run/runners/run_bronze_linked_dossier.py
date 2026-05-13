"""
Local runner — ``v2_bronze.bronze_linked_dossier``.

Reads ``Data/tr_linked_dossier.csv`` and writes parquet to
``Practice_Run/output/bronze_linked_dossier/``.

Usage::

    python Practice_Run/runners/run_bronze_linked_dossier.py
"""

from __future__ import annotations

from _common import bootstrap_paths, get_local_spark, read_csv_as_strings, write_parquet

bootstrap_paths()

from config import dataset_path, ensure_output_dir  # noqa: E402
from v2_bronze import bronze_linked_dossier as mod  # noqa: E402


INPUT_COLUMNS = [
    "skywise_link_id",
    "dossier_id",
    "dossier_internal_id",
    "dossier_domain",
    "linked_dossier_id",
    "linked_dossier_internal_id",
    "linked_dossier_domain",
    "linked_type",
]


def main() -> None:
    ensure_output_dir()
    spark = get_local_spark("UFO-V2-Bronze-LinkedDossier")

    src = read_csv_as_strings(spark, dataset_path("raw.linked_dossier"), INPUT_COLUMNS)
    out_df = mod._transform(src)

    sink = write_parquet(out_df, dataset_path("bronze.linked_dossier"))
    print(f"[bronze.linked_dossier] rows={out_df.count()} -> {sink}")


if __name__ == "__main__":
    main()
