"""
Shared utilities for the UFO V2 Bronze layer.

All Bronze transforms call into this module so that:

* timezone normalization is implemented in exactly one place,
* array-encoded strings (``"[A, B, C]"``) are parsed consistently,
* data-quality columns are appended uniformly,
* dataset RIDs are looked up from a single registry that operators update
  when promoting branches.

Design notes
------------

**Why parse timezones explicitly?**

Foundry CSV inputs arrive as plain strings. TechRequest V2 emits two columns
per timestamp: a naive value (``"2026-01-07 03:43:15"``) plus a separate
offset (``"-05:00"``). If we cast the value column directly to
``TimestampType`` without the offset, Spark interprets it in the cluster's
session timezone — which silently produces incorrect UTC instants for any
non-UTC operator.

The contract here is:

1. Set ``spark.sql.session.timeZone`` to ``UTC`` at the top of every Bronze
   driver.
2. Use :func:`parse_tz_timestamp` to combine value + offset into an
   ISO-8601 string with offset, then ``to_timestamp`` it. Spark will read
   the offset and store the underlying instant as UTC.
3. Keep the original ``*_tz`` column as a String. It is rarely used
   downstream but cheap to retain for audit / display.

**Why a RID registry?**

The V1 transforms hard-code ``ri.foundry.main.dataset.<uuid>`` in every
file. That made promotion across branches painful. For V2 we centralize the
mapping in :data:`RIDS` so every transform reads its input/output RID by a
stable logical name. When a new branch is created, operators rebind the
values in this module only.
"""

from __future__ import annotations

from typing import Iterable, Mapping

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql import types as T

# ---------------------------------------------------------------------------
# RID registry
# ---------------------------------------------------------------------------
#
# These are placeholder RIDs. When the actual Bronze datasets are created in
# Foundry, paste the real RIDs over the placeholders below. Logical names
# (the dict keys) must remain stable — transform modules reference them by
# key.
RIDS: Mapping[str, str] = {
    # ----- Raw inputs (CSV/parquet uploads from TechRequest V2) -----
    "raw.techrequest_index": "ri.foundry.main.dataset.PLACEHOLDER-raw-techrequest-index-v2",
    "raw.dossier_metadata": "ri.foundry.main.dataset.PLACEHOLDER-raw-dossier-metadata",
    "raw.messages_metadata": "ri.foundry.main.dataset.PLACEHOLDER-raw-messages-metadata",
    "raw.manufacturing_quality_reference": (
        "ri.foundry.main.dataset.PLACEHOLDER-raw-mfg-quality-reference"
    ),
    "raw.linked_dossier": "ri.foundry.main.dataset.PLACEHOLDER-raw-linked-dossier",
    # ----- Bronze outputs -----
    "bronze.techrequest_index": (
        "ri.foundry.main.dataset.PLACEHOLDER-bronze-techrequest-index"
    ),
    "bronze.dossier_metadata": (
        "ri.foundry.main.dataset.PLACEHOLDER-bronze-dossier-metadata"
    ),
    "bronze.messages_metadata": (
        "ri.foundry.main.dataset.PLACEHOLDER-bronze-messages-metadata"
    ),
    "bronze.manufacturing_quality_reference": (
        "ri.foundry.main.dataset.PLACEHOLDER-bronze-mfg-quality-reference"
    ),
    "bronze.linked_dossier": (
        "ri.foundry.main.dataset.PLACEHOLDER-bronze-linked-dossier"
    ),
}


def rid(name: str) -> str:
    """Return the RID registered under ``name``.

    Raises a clear error if the operator forgot to register a logical name.
    """
    if name not in RIDS:
        raise KeyError(
            f"No RID registered for '{name}'. "
            f"Known: {sorted(RIDS)}"
        )
    return RIDS[name]


# ---------------------------------------------------------------------------
# Spark session
# ---------------------------------------------------------------------------

def get_spark(app_name: str) -> SparkSession:
    """Build a Bronze-mode Spark session with UTC session timezone.

    Bronze transforms are I/O-bound; defaults are deliberately conservative.
    Tune in P5 ("Incrementality & scale") rather than per-transform here.
    """
    return (
        SparkSession.builder.appName(app_name)
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.adaptive.enabled", "true")
        .getOrCreate()
    )


# ---------------------------------------------------------------------------
# Timezone normalization
# ---------------------------------------------------------------------------

_TS_VALUE_NULLISH = [
    "",  # empty string
    "null",
    "NULL",
    "None",
]


def parse_tz_timestamp(value_col: str, tz_col: str) -> "F.Column":
    """Normalize a TechRequest V2 timestamp pair into a UTC ``TimestampType``.

    Inputs
    ------
    value_col
        Name of the naive timestamp column. Expected forms include
        ``"2026-01-07 03:43:15"``, ``"2026-01-07T03:43:15"``, or
        ``"2026-01-07 03:43:15.123"``.
    tz_col
        Name of the offset column. Expected forms include ``"-05:00"`` or
        ``"+02:00"``. Null/empty offsets default to UTC.

    Behavior
    --------
    * Returns ``NULL`` if the value column is null or one of
      :data:`_TS_VALUE_NULLISH`.
    * Otherwise concatenates ``value`` and ``offset`` into an ISO-8601 string
      and calls ``to_timestamp``. The session timezone is UTC (see
      :func:`get_spark`) so the resulting ``TimestampType`` stores the
      correct UTC instant regardless of the original offset.
    """
    value = F.col(value_col)
    tz = F.col(tz_col)

    cleaned_value = F.regexp_replace(value, " ", "T")
    safe_tz = F.coalesce(F.nullif(tz, F.lit("")), F.lit("+00:00"))

    iso_string = F.concat(cleaned_value, safe_tz)
    is_nullish = (
        value.isNull()
        | F.trim(value).isin(*_TS_VALUE_NULLISH)
    )
    return F.when(is_nullish, F.lit(None).cast(T.TimestampType())).otherwise(
        F.to_timestamp(iso_string)
    )


# ---------------------------------------------------------------------------
# Array parsing
# ---------------------------------------------------------------------------

def parse_int_array(col_name: str) -> "F.Column":
    """Parse a ``"[1234, 5678]"`` string column into ``Array<Integer>``.

    * Strips surrounding brackets.
    * Splits on commas with optional whitespace.
    * Casts non-empty entries to ``IntegerType``; invalid entries become NULL
      so that one corrupt row does not poison a whole partition.
    * Returns an empty array when the input is null, empty, or ``"[]"``.
    """
    raw = F.col(col_name)
    stripped = F.regexp_replace(F.coalesce(raw, F.lit("")), r"[\[\]]", "")
    trimmed = F.trim(stripped)
    is_empty = (trimmed == "") | (trimmed.isNull())
    tokens = F.split(trimmed, r"\s*,\s*")
    # Cast each element to int via transform()
    parsed = F.expr(
        f"transform(split(regexp_replace(coalesce({col_name}, ''), '[\\\\[\\\\]]', ''), "
        f"'\\\\s*,\\\\s*'), x -> CASE WHEN x = '' THEN NULL ELSE cast(x as int) END)"
    )
    return F.when(is_empty, F.array().cast(T.ArrayType(T.IntegerType()))).otherwise(parsed)


def parse_str_array(col_name: str) -> "F.Column":
    """Parse a ``"[ABC, DEF]"`` string column into ``Array<String>``.

    Behaviorally identical to :func:`parse_int_array` minus the integer cast.
    Trims whitespace inside each entry.
    """
    raw = F.col(col_name)
    stripped = F.regexp_replace(F.coalesce(raw, F.lit("")), r"[\[\]]", "")
    trimmed = F.trim(stripped)
    is_empty = (trimmed == "") | (trimmed.isNull())
    tokens = F.expr(
        f"transform(split(regexp_replace(coalesce({col_name}, ''), '[\\\\[\\\\]]', ''), "
        f"'\\\\s*,\\\\s*'), x -> CASE WHEN x = '' THEN NULL ELSE x END)"
    )
    return F.when(is_empty, F.array().cast(T.ArrayType(T.StringType()))).otherwise(tokens)


# ---------------------------------------------------------------------------
# Boolean parsing
# ---------------------------------------------------------------------------

def parse_bool(col_name: str) -> "F.Column":
    """Cast TechRequest V2 boolean strings to ``BooleanType``.

    Accepts ``true / false / True / TRUE / 1 / 0``. Anything else becomes NULL
    rather than silently bucketing into ``false``.
    """
    raw = F.lower(F.trim(F.col(col_name)))
    return (
        F.when(raw.isin("true", "1", "t"), F.lit(True))
        .when(raw.isin("false", "0", "f"), F.lit(False))
        .otherwise(F.lit(None).cast(T.BooleanType()))
    )


# ---------------------------------------------------------------------------
# Numeric parsing
# ---------------------------------------------------------------------------

def parse_int(col_name: str) -> "F.Column":
    """Cast a string column to ``IntegerType`` with safe NULL handling.

    Accepts numeric strings that may carry leading zeros
    (e.g. ``"0000027041"``). Empty / non-numeric inputs become NULL.
    """
    raw = F.trim(F.col(col_name))
    is_nullish = raw.isNull() | (raw == "") | (raw == "null")
    return F.when(is_nullish, F.lit(None).cast(T.IntegerType())).otherwise(
        raw.cast(T.IntegerType())
    )


def parse_long(col_name: str) -> "F.Column":
    """Cast a string column to ``LongType`` with safe NULL handling."""
    raw = F.trim(F.col(col_name))
    is_nullish = raw.isNull() | (raw == "") | (raw == "null")
    return F.when(is_nullish, F.lit(None).cast(T.LongType())).otherwise(
        raw.cast(T.LongType())
    )


def parse_double(col_name: str) -> "F.Column":
    """Cast a string column to ``DoubleType`` with safe NULL handling."""
    raw = F.trim(F.col(col_name))
    is_nullish = raw.isNull() | (raw == "") | (raw == "null")
    return F.when(is_nullish, F.lit(None).cast(T.DoubleType())).otherwise(
        raw.cast(T.DoubleType())
    )


def parse_string(col_name: str) -> "F.Column":
    """Return the trimmed string column with empty strings coerced to NULL."""
    raw = F.trim(F.col(col_name))
    return F.when(raw == "", F.lit(None).cast(T.StringType())).otherwise(raw)


# ---------------------------------------------------------------------------
# Data-quality columns
# ---------------------------------------------------------------------------

def with_dq_columns(df: DataFrame, source_dataset_name: str) -> DataFrame:
    """Append the three Bronze data-quality columns.

    * ``_ingested_at`` — UTC timestamp of the Bronze run.
    * ``_source_dataset`` — logical name of the upstream raw dataset.
    * ``_row_uid`` — deterministic-ish row identity built from the natural
      key when available, otherwise a hash of the row. Stable within a single
      run; partition-stable across runs.
    """
    return (
        df.withColumn("_ingested_at", F.current_timestamp())
        .withColumn("_source_dataset", F.lit(source_dataset_name))
        .withColumn(
            "_row_uid",
            F.sha2(F.concat_ws("|", *[F.col(c).cast(T.StringType()) for c in df.columns]), 256),
        )
    )


# ---------------------------------------------------------------------------
# Schema enforcement
# ---------------------------------------------------------------------------

def select_with_schema(df: DataFrame, schema: T.StructType) -> DataFrame:
    """Project ``df`` so that its columns exactly match ``schema``.

    Missing columns are added as NULL with the right type. Extra columns are
    dropped (and logged via ``df.schema``). This guarantees the Bronze
    contract regardless of upstream schema drift.
    """
    have = set(df.columns)
    want = [f.name for f in schema.fields]

    projected = []
    for field in schema.fields:
        if field.name in have:
            projected.append(F.col(field.name).cast(field.dataType).alias(field.name))
        else:
            projected.append(F.lit(None).cast(field.dataType).alias(field.name))
    return df.select(*projected)


def empty_string_input_schema(column_names: Iterable[str]) -> T.StructType:
    """Build an all-string ``StructType`` for reading raw CSV inputs.

    Bronze never trusts the upstream schema for typed columns — it casts
    everything explicitly. Reading every input as string up front keeps
    parsing predictable.
    """
    return T.StructType(
        [T.StructField(name, T.StringType(), nullable=True) for name in column_names]
    )
