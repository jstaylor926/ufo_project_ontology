"""
Local runner — ``v2_bronze.bronze_dossier_metadata``.

Reads ``Data/tr_dossier_metadata_filtered.csv`` and writes parquet to
``Practice_Run/output/bronze_dossier_metadata/``.

Usage::

    python Practice_Run/runners/run_bronze_dossier_metadata.py
"""

from __future__ import annotations

from _common import bootstrap_paths, get_local_spark, read_csv_as_strings, write_parquet

bootstrap_paths()

from config import dataset_path, ensure_output_dir  # noqa: E402
from v2_bronze import bronze_dossier_metadata as mod  # noqa: E402


# Union of every column the module reads — see the four parse lists in
# v2_bronze/bronze_dossier_metadata.py.
INPUT_COLUMNS = (
    mod._STRING_COLS
    + mod._BOOL_COLS
    + mod._INT_COLS
    + [c for pair in mod._TS_PAIRS for c in pair]
)


def main() -> None:
    ensure_output_dir()
    spark = get_local_spark("UFO-V2-Bronze-DossierMetadata")

    src = read_csv_as_strings(spark, dataset_path("raw.dossier_metadata"), INPUT_COLUMNS)
    out_df = mod._transform(src)

    sink = write_parquet(out_df, dataset_path("bronze.dossier_metadata"))
    print(f"[bronze.dossier_metadata] rows={out_df.count()} -> {sink}")


if __name__ == "__main__":
    main()
