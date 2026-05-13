"""
Local runner — ``v2_bronze.bronze_manufacturing_quality_reference``.

Reads ``Data/tr_manufacturing_quality_reference.csv`` and writes parquet to
``Practice_Run/output/bronze_manufacturing_quality_reference/``.

Usage::

    python Practice_Run/runners/run_bronze_manufacturing_quality_reference.py
"""

from __future__ import annotations

from _common import bootstrap_paths, get_local_spark, read_csv_as_strings, write_parquet

bootstrap_paths()

from config import dataset_path, ensure_output_dir  # noqa: E402
from v2_bronze import bronze_manufacturing_quality_reference as mod  # noqa: E402


INPUT_COLUMNS = [
    "skywise_rfi_id",
    "dossier_id",
    "dossier_internal_id",
    "rfi_message_id",
    "rfi_creation_time",
    "rfi_creation_time_tz",
]


def main() -> None:
    ensure_output_dir()
    spark = get_local_spark("UFO-V2-Bronze-MfgQualityReference")

    src = read_csv_as_strings(
        spark, dataset_path("raw.manufacturing_quality_reference"), INPUT_COLUMNS,
    )
    out_df = mod._transform(src)

    sink = write_parquet(out_df, dataset_path("bronze.manufacturing_quality_reference"))
    print(f"[bronze.manufacturing_quality_reference] rows={out_df.count()} -> {sink}")


if __name__ == "__main__":
    main()
