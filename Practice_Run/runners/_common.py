"""
Shared helpers for the local Practice_Run scripts.

Three responsibilities:

* ``bootstrap_paths()`` — make sure the local ``transforms`` stub and the
  V2 packages in ``DataTransformationRepository/`` are importable.
* ``get_local_spark()`` — build a UTC-session SparkSession suitable for the
  Bronze transforms.
* ``read_csv_as_strings()`` — read a CSV with every column typed as String,
  matching the Bronze contract (``empty_string_input_schema``).
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable


# ---------------------------------------------------------------------------
# Path bootstrap
# ---------------------------------------------------------------------------

def bootstrap_paths() -> Path:
    """Prepend the local ``Practice_Run/`` and ``DataTransformationRepository/``
    directories to ``sys.path``.

    Order matters: the local ``Practice_Run/`` directory comes first so that
    ``import transforms.api`` resolves to our stub before any real Foundry
    package on the machine.
    """
    practice_run_dir = Path(__file__).resolve().parent.parent  # .../Practice_Run
    repo_root = practice_run_dir.parent                         # repo root
    dt_repo = repo_root / "DataTransformationRepository"

    for p in (practice_run_dir, dt_repo):
        s = str(p)
        if s not in sys.path:
            sys.path.insert(0, s)

    return repo_root


# ---------------------------------------------------------------------------
# Spark
# ---------------------------------------------------------------------------

def get_local_spark(app_name: str = "UFO-V2-Practice"):
    """Build a local SparkSession with UTC session timezone.

    Mirrors the contract in ``v2_bronze._bronze_utils.get_spark`` so the
    timestamp parsing produces identical results to Foundry.
    """
    from pyspark.sql import SparkSession

    return (
        SparkSession.builder.appName(app_name)
        .master("local[*]")
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.adaptive.enabled", "true")
        # Quiet down Spark's startup logging.
        .config("spark.ui.showConsoleProgress", "false")
        .getOrCreate()
    )


# ---------------------------------------------------------------------------
# CSV ingestion
# ---------------------------------------------------------------------------

def read_csv_as_strings(spark, csv_path: Path, column_names: Iterable[str]):
    """Read a CSV file with every column typed as String.

    Matches ``v2_bronze._bronze_utils.empty_string_input_schema`` — the
    Bronze layer expects raw inputs to be all-strings and casts to typed
    columns itself.

    Parameters
    ----------
    spark
        A live SparkSession.
    csv_path
        Path to the CSV on disk.
    column_names
        Ordered list of columns to project. Columns missing from the CSV
        will be added as NULL strings; extra columns in the CSV are
        dropped. This matches the way the Foundry-side schema enforcement
        behaves at write time.
    """
    from pyspark.sql import functions as F
    from pyspark.sql import types as T

    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(
            f"CSV not found: {csv_path}. "
            f"Check Practice_Run/config.py::DATASETS."
        )

    schema = T.StructType(
        [T.StructField(c, T.StringType(), nullable=True) for c in column_names]
    )

    # Read without a strict schema so we tolerate column-order drift in the
    # CSV, then project to the canonical column list.
    raw = (
        spark.read.option("header", "true")
        .option("multiLine", "true")
        .option("escape", '"')
        .csv(str(csv_path))
    )

    have = set(raw.columns)
    projected = []
    for f in schema.fields:
        if f.name in have:
            projected.append(F.col(f.name).cast(T.StringType()).alias(f.name))
        else:
            projected.append(F.lit(None).cast(T.StringType()).alias(f.name))
    return raw.select(*projected)


# ---------------------------------------------------------------------------
# Output helper
# ---------------------------------------------------------------------------

def write_parquet(df, sink_path: Path) -> Path:
    """Write a DataFrame to ``sink_path`` as parquet, overwriting any prior run."""
    sink_path = Path(sink_path)
    sink_path.parent.mkdir(parents=True, exist_ok=True)
    df.write.mode("overwrite").parquet(str(sink_path))
    return sink_path
