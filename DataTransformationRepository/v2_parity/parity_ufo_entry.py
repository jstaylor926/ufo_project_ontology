"""
Parity transform — V1 UfoEntry vs V2-derived UfoEntry.

Reads two datasets, joins on ``dossier_internal_id``, emits a long-form
diff and a per-field summary.

Inputs
------
* ``v1.ufo_entry`` — output of ``DataTransformationRepository/UFOEntries.py``
  (V1 transform, untouched).
* ``v2.bronze.techrequest_index`` — output of
  ``v2_bronze/bronze_techrequest_index.py`` (Phase 1 Bronze).
  In Phase 2 this input is rebound to the Silver V2 UfoEntry without any
  code change here — just edit ``RIDS["v2.bronze.techrequest_index"]``.

Outputs
-------
* ``parity.ufo_entry_diff`` — one row per ``(dossier_internal_id, field)``.
* ``parity.ufo_entry_summary`` — one row per field with aggregate counts and
  match percentage.
"""

from __future__ import annotations

import uuid

from pyspark.sql import SparkSession
from transforms.api import Input, Output, transform

from ._parity_utils import (
    JOIN_KEY,
    build_diff,
    build_summary,
    held_out_sample,
    rid,
)


def _get_spark(app_name: str) -> SparkSession:
    """Build the Spark session with the same UTC contract as v2_bronze."""
    return (
        SparkSession.builder.appName(app_name)
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.adaptive.enabled", "true")
        .getOrCreate()
    )


@transform(
    diff_out=Output(rid("parity.ufo_entry_diff")),
    summary_out=Output(rid("parity.ufo_entry_summary")),
    v1_df=Input(rid("v1.ufo_entry")),
    v2_df=Input(rid("v2.bronze.techrequest_index")),
)
def compute(diff_out, summary_out, v1_df, v2_df):
    """Driver entry point.

    The V1 dataset is read first to ensure the join key column exists with
    the V1 spelling (``Internal_Id``); we alias to ``dossier_internal_id``
    on the way in so the harness can use a single join key throughout.
    """
    _get_spark("UFO-V2-Parity-UfoEntry")

    run_id = str(uuid.uuid4())

    v1 = v1_df.dataframe()
    v2 = v2_df.dataframe()

    # V1 stores the internal ID as `Internal_Id`. Normalize the column name
    # so build_diff() can join on a single canonical key. This is the only
    # column rename we do — every other V1 column name is preserved and
    # carried into the FIELD_MAP.
    if "Internal_Id" in v1.columns and JOIN_KEY not in v1.columns:
        v1 = v1.withColumnRenamed("Internal_Id", JOIN_KEY)

    # Limit both sides to the held-out hash bucket so the harness stays
    # cheap to run on every build.
    v1_sample = held_out_sample(v1)
    v2_sample = held_out_sample(v2)

    diff = build_diff(v1_sample, v2_sample, run_id=run_id)
    summary = build_summary(diff, run_id=run_id)

    diff_out.write_dataframe(diff)
    summary_out.write_dataframe(summary)
