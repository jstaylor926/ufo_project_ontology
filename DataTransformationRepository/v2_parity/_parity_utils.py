"""
Helpers for the UFO V2 parity harness.

Three responsibilities:

1. **Sample selection** — :func:`held_out_sample` returns a deterministic
   subset of ``dossier_internal_id``\\ s (default 1/256, ~0.4%) using a hash
   bucket. Reproducible across runs; small enough to inspect by hand; large
   enough to surface systemic drift.

2. **Field comparators** — :func:`compare_field` and the type-specific
   variants below produce a uniform ``match_kind`` classification for any
   pair of values. Time comparisons distinguish "exact" from
   "offset-tolerant" so we can see TZ regressions separately from real
   data drift.

3. **The field map** — :data:`FIELD_MAP` lists every V1↔V2 field pair the
   harness compares, with its comparator. New mappings are a one-line
   addition.

No V1 file is modified; no v2_bronze file is modified. This module only
imports from ``pyspark`` and the standard library.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List, Mapping, Optional

from pyspark.sql import Column, DataFrame
from pyspark.sql import functions as F
from pyspark.sql import types as T


# ---------------------------------------------------------------------------
# RID registry (parity-only — extends, does not modify, the Bronze registry)
# ---------------------------------------------------------------------------

RIDS: Mapping[str, str] = {
    # V1 source — the existing UFOEntries.py output. RID copied verbatim
    # from the @transform decorator in DataTransformationRepository/UFOEntries.py
    # so the parity harness reads the live V1 ontology-backing dataset.
    "v1.ufo_entry": "ri.foundry.main.dataset.90e0838b-22bf-4e38-b844-5e7a12da5616",

    # V2 source — Bronze techrequest_index. Logical name kept identical to
    # the entry in v2_bronze._bronze_utils.RIDS so operators only need to
    # rebind one place.
    "v2.bronze.techrequest_index": (
        "ri.foundry.main.dataset.PLACEHOLDER-bronze-techrequest-index"
    ),

    # Outputs — created in Foundry; PLACEHOLDER until the datasets exist.
    "parity.ufo_entry_diff": (
        "ri.foundry.main.dataset.PLACEHOLDER-parity-ufo-entry-diff"
    ),
    "parity.ufo_entry_summary": (
        "ri.foundry.main.dataset.PLACEHOLDER-parity-ufo-entry-summary"
    ),
}


def rid(name: str) -> str:
    if name not in RIDS:
        raise KeyError(
            f"No RID registered for '{name}'. Known: {sorted(RIDS)}"
        )
    return RIDS[name]


# ---------------------------------------------------------------------------
# Sample selection
# ---------------------------------------------------------------------------

JOIN_KEY = "dossier_internal_id"
"""Stable identifier across V1 and V2 of TechRequest. Used as the parity
harness join key and as the input to the hash-bucket sampler."""


def held_out_sample(
    df: DataFrame,
    internal_id_col: str = JOIN_KEY,
    bucket_prefix: str = "00",
) -> DataFrame:
    """Return rows whose ``sha2(internal_id, 256)`` starts with ``bucket_prefix``.

    Defaults give 1/256 (~0.4%) of the population. Deterministic across runs,
    so a regression noticed on a particular dossier_internal_id can always be
    re-found in the next build.

    The bucket prefix is hex; ``"00"`` is the lowest bucket and is preferred
    for default sampling so that comparison datasets across systems stay
    aligned without further coordination.
    """
    return df.filter(
        F.sha2(F.col(internal_id_col).cast(T.StringType()), 256).startswith(bucket_prefix)
    )


# ---------------------------------------------------------------------------
# Comparators
# ---------------------------------------------------------------------------
#
# Every comparator returns a struct with three columns:
#   * matches    : Boolean
#   * match_kind : String  (one of: exact, tz_offset_equivalent, both_null,
#                          v1_null, v2_null, mismatch, missing_v1, missing_v2)
#   * delta      : String  (free-form note useful for triage; may be NULL)
#
# These structs are merged into the diff dataset row-by-row.


def _both_null(v1: Column, v2: Column) -> Column:
    return v1.isNull() & v2.isNull()


def _classify(matches: Column, match_kind: Column, delta: Column) -> Column:
    return F.struct(
        matches.alias("matches"),
        match_kind.alias("match_kind"),
        delta.alias("delta"),
    )


def compare_string(v1: Column, v2: Column, *, case_insensitive: bool = False,
                   trim: bool = True) -> Column:
    """Compare two string columns.

    Empty strings on either side are treated as NULL (consistent with the
    Bronze contract). ``case_insensitive=True`` and ``trim=True`` are
    defensive defaults for cross-version string comparison.
    """
    def _norm(c: Column) -> Column:
        x = F.when(c == "", None).otherwise(c)
        if trim:
            x = F.trim(x)
        if case_insensitive:
            x = F.lower(x)
        return x

    a, b = _norm(v1), _norm(v2)
    both_null = _both_null(a, b)
    only_v1 = a.isNull() & b.isNotNull()
    only_v2 = a.isNotNull() & b.isNull()
    exact = a.eqNullSafe(b) & a.isNotNull()

    matches = exact | both_null
    match_kind = (
        F.when(both_null, F.lit("both_null"))
        .when(exact, F.lit("exact"))
        .when(only_v1, F.lit("v2_null"))
        .when(only_v2, F.lit("v1_null"))
        .otherwise(F.lit("mismatch"))
    )
    delta = F.when(
        matches, F.lit(None).cast(T.StringType())
    ).otherwise(F.concat_ws(" | ", a, b))
    return _classify(matches, match_kind, delta)


def compare_bool(v1: Column, v2: Column) -> Column:
    both_null = _both_null(v1, v2)
    matches = v1.eqNullSafe(v2)
    match_kind = (
        F.when(both_null, F.lit("both_null"))
        .when(matches & v1.isNotNull(), F.lit("exact"))
        .when(v1.isNull(), F.lit("v1_null"))
        .when(v2.isNull(), F.lit("v2_null"))
        .otherwise(F.lit("mismatch"))
    )
    delta = F.when(matches, F.lit(None).cast(T.StringType())).otherwise(
        F.concat_ws(" | ", v1.cast(T.StringType()), v2.cast(T.StringType()))
    )
    return _classify(matches, match_kind, delta)


def compare_int(v1: Column, v2: Column, tolerance: int = 0) -> Column:
    """Compare two integer-typed columns with optional absolute tolerance."""
    both_null = _both_null(v1, v2)
    diff = F.abs(v1.cast(T.LongType()) - v2.cast(T.LongType()))
    within = diff <= F.lit(tolerance)
    exact = within & v1.isNotNull() & v2.isNotNull()

    matches = exact | both_null
    match_kind = (
        F.when(both_null, F.lit("both_null"))
        .when(exact, F.lit("exact"))
        .when(v1.isNull(), F.lit("v1_null"))
        .when(v2.isNull(), F.lit("v2_null"))
        .otherwise(F.lit("mismatch"))
    )
    delta = F.when(matches, F.lit(None).cast(T.StringType())).otherwise(
        F.concat_ws(" | ", v1.cast(T.StringType()), v2.cast(T.StringType()))
    )
    return _classify(matches, match_kind, delta)


def compare_double(v1: Column, v2: Column, tolerance: float = 0.01) -> Column:
    both_null = _both_null(v1, v2)
    diff = F.abs(v1.cast(T.DoubleType()) - v2.cast(T.DoubleType()))
    within = diff <= F.lit(tolerance)
    exact = within & v1.isNotNull() & v2.isNotNull()

    matches = exact | both_null
    match_kind = (
        F.when(both_null, F.lit("both_null"))
        .when(exact, F.lit("exact"))
        .when(v1.isNull(), F.lit("v1_null"))
        .when(v2.isNull(), F.lit("v2_null"))
        .otherwise(F.lit("mismatch"))
    )
    delta = F.when(matches, F.lit(None).cast(T.StringType())).otherwise(
        F.concat_ws(" | ", v1.cast(T.StringType()), v2.cast(T.StringType()))
    )
    return _classify(matches, match_kind, delta)


def compare_int_array_as_set(v1: Column, v2: Column) -> Column:
    """Compare two integer arrays for *set* equality (order ignored)."""
    a = F.sort_array(F.coalesce(v1, F.array().cast(T.ArrayType(T.IntegerType()))))
    b = F.sort_array(F.coalesce(v2, F.array().cast(T.ArrayType(T.IntegerType()))))

    both_null = v1.isNull() & v2.isNull()
    matches = a.eqNullSafe(b)
    match_kind = (
        F.when(both_null, F.lit("both_null"))
        .when(matches, F.lit("exact"))
        .when(v1.isNull(), F.lit("v1_null"))
        .when(v2.isNull(), F.lit("v2_null"))
        .otherwise(F.lit("mismatch"))
    )
    delta = F.when(matches, F.lit(None).cast(T.StringType())).otherwise(
        F.concat_ws(" | ", a.cast(T.StringType()), b.cast(T.StringType()))
    )
    return _classify(matches, match_kind, delta)


def compare_timestamp(
    v1: Column,
    v2: Column,
    exact_tolerance_seconds: int = 1,
    offset_tolerance_hours: int = 24,
) -> Column:
    """Compare two timestamp columns.

    The V1 transform was written before the Bronze TZ contract, so V1
    timestamps are likely "naive local" while V2 Bronze stores true UTC.
    Differences within ``offset_tolerance_hours`` are tagged
    ``tz_offset_equivalent`` rather than ``mismatch`` — they indicate a TZ
    interpretation gap, not data drift. Anything outside the offset window
    is a real mismatch.
    """
    v1_long = v1.cast(T.TimestampType()).cast(T.LongType())  # seconds
    v2_long = v2.cast(T.TimestampType()).cast(T.LongType())
    diff = F.abs(v1_long - v2_long)
    offset_seconds = offset_tolerance_hours * 3600

    both_null = _both_null(v1, v2)
    exact = (diff <= F.lit(exact_tolerance_seconds)) & v1.isNotNull() & v2.isNotNull()
    tz_eq = (
        ~exact
        & (diff <= F.lit(offset_seconds))
        & v1.isNotNull()
        & v2.isNotNull()
    )

    matches = exact | both_null
    match_kind = (
        F.when(both_null, F.lit("both_null"))
        .when(exact, F.lit("exact"))
        .when(tz_eq, F.lit("tz_offset_equivalent"))
        .when(v1.isNull(), F.lit("v1_null"))
        .when(v2.isNull(), F.lit("v2_null"))
        .otherwise(F.lit("mismatch"))
    )
    delta = F.when(matches, F.lit(None).cast(T.StringType())).otherwise(
        F.concat_ws(" | ",
                    v1.cast(T.StringType()),
                    v2.cast(T.StringType()),
                    F.concat(F.lit("Δs="), diff.cast(T.StringType())))
    )
    return _classify(matches, match_kind, delta)


def compare_date_as_string(v1: Column, v2: Column) -> Column:
    """Cast both sides to date and compare. Used for V1 DateType vs V2
    TimestampType pairs where day-precision parity is sufficient."""
    a = v1.cast(T.DateType()).cast(T.StringType())
    b = v2.cast(T.DateType()).cast(T.StringType())
    return compare_string(a, b, case_insensitive=False, trim=False)


# ---------------------------------------------------------------------------
# Aliases / known patches
# ---------------------------------------------------------------------------

def operator_icao_alias_v1(v2_col: Column) -> Column:
    """V1's UFOEntries.py replaces ``operator_ICAO == 'USA'`` with ``'AAL'``.

    The parity harness applies the same patch to the V2 side before
    comparing so that those rows do not show up as false-positive
    mismatches. This is intentionally narrow — any further V1 patches must
    be explicitly listed here.
    """
    return F.when(v2_col == "USA", F.lit("AAL")).otherwise(v2_col)


# ---------------------------------------------------------------------------
# Field map
# ---------------------------------------------------------------------------

Comparator = Callable[[Column, Column], Column]


@dataclass(frozen=True)
class FieldPair:
    """One row of the V1↔V2 field map."""
    v1_col: str
    v2_col: str
    comparator: Comparator
    field_label: str  # human-friendly label used in the diff output
    notes: str = ""

    def compare(self, v1_df: DataFrame, v2_df: DataFrame) -> Column:
        """Build the per-row comparison struct for this field."""
        return self.comparator(F.col("v1." + self.v1_col), F.col("v2." + self.v2_col))


# Canonical field map.
# Add new fields here when Silver / V2 derivations expose more parity surface.
FIELD_MAP: List[FieldPair] = [
    FieldPair("Dossier_ID", "dossier_id", compare_string, "dossier_id"),
    FieldPair("Domain", "dossier_domain", compare_string, "dossier_domain"),
    FieldPair("Title", "dossier_title", compare_string, "dossier_title"),
    FieldPair("Label", "dossier_label", compare_string, "dossier_label"),
    FieldPair("Channel", "dossier_channel", compare_string, "dossier_channel"),
    FieldPair("Dossier_isMigrated", "is_dossier_migrated", compare_bool, "is_dossier_migrated"),
    FieldPair("Status", "dossier_status", compare_string, "dossier_status"),
    FieldPair("Program_Letter", "aircraft_program_code", compare_string, "aircraft_program_code"),
    FieldPair("Program", "aircraft_program", compare_string, "aircraft_program"),
    FieldPair("Aircraft_Type", "aircraft_type", compare_string, "aircraft_type"),
    FieldPair("Aircraft_Model", "aircraft_model", compare_string, "aircraft_model"),
    FieldPair("isapplicable_forAll_MSN", "is_applicable_for_all_msn", compare_bool, "is_applicable_for_all_msn"),
    FieldPair("MSN", "aircraft_msn", compare_int_array_as_set, "aircraft_msn"),
    FieldPair("Registration_Number", "registration_number", compare_string, "registration_number"),
    FieldPair("Aircraft_Flightcycs", "aircraft_flight_cycles", compare_int, "aircraft_flight_cycles"),
    FieldPair("engineSeries", "engine_series", compare_string, "engine_series"),
    FieldPair("engineModel", "engine_model", compare_string, "engine_model"),
    FieldPair("component_SerialNum", "component_serial_number", compare_string, "component_serial_number"),
    FieldPair("component_PartNum", "component_part_number", compare_string, "component_part_number"),
    FieldPair("component_FIN", "component_FIN", compare_string, "component_FIN"),
    FieldPair("Dossier_Requestor_ICAO", "requestor_company_code_icao", compare_string, "requestor_company_code_icao"),
    # Timestamps: V1 was naive, V2 is true UTC → expect tz_offset_equivalent on most rows.
    FieldPair("Dossier_UpDate", "update_time", compare_timestamp, "update_time"),
    FieldPair("Dossier_SubmitDate", "submit_time", compare_timestamp, "submit_time"),
    FieldPair("Dossier_ClosureDate", "closure_time", compare_timestamp, "closure_time"),
    # Date-only field on V1 side.
    FieldPair("Dossier_CreationDate", "creation_time", compare_date_as_string, "creation_time"),
    FieldPair("nb_TotalMessages", "number_total_messages", compare_int, "number_total_messages"),
    FieldPair("nb_ClosedMessages", "number_closed_messages", compare_int, "number_closed_messages"),
    FieldPair("highest_Message_Urgency", "highest_message_urgency",
              lambda a, b: compare_string(a, b, case_insensitive=True),
              "highest_message_urgency"),
    FieldPair("Message_Open", "is_message_open", compare_bool, "is_message_open"),
    FieldPair("has_Approval_Doc", "has_approval_doc", compare_bool, "has_approval_doc"),
]


# Field handled specially because V1 applied a USA→AAL patch.
OPERATOR_ICAO_FIELD = FieldPair(
    "operator_ICAO", "operator_code_icao",
    compare_string, "operator_code_icao",
    notes="V2 side patched with USA→AAL alias to match the V1 transform.",
)


# ---------------------------------------------------------------------------
# Diff / summary schemas
# ---------------------------------------------------------------------------

DIFF_SCHEMA = T.StructType([
    T.StructField("dossier_internal_id", T.StringType(), nullable=False),
    T.StructField("field_name", T.StringType(), nullable=False),
    T.StructField("v1_value", T.StringType(), nullable=True),
    T.StructField("v2_value", T.StringType(), nullable=True),
    T.StructField("matches", T.BooleanType(), nullable=False),
    T.StructField("match_kind", T.StringType(), nullable=False),
    T.StructField("delta", T.StringType(), nullable=True),
    T.StructField("_ingested_at", T.TimestampType(), nullable=False),
    T.StructField("_run_id", T.StringType(), nullable=False),
])

SUMMARY_SCHEMA = T.StructType([
    T.StructField("field_name", T.StringType(), nullable=False),
    T.StructField("compared_count", T.LongType(), nullable=False),
    T.StructField("exact_count", T.LongType(), nullable=False),
    T.StructField("tz_offset_equivalent_count", T.LongType(), nullable=False),
    T.StructField("both_null_count", T.LongType(), nullable=False),
    T.StructField("v1_null_count", T.LongType(), nullable=False),
    T.StructField("v2_null_count", T.LongType(), nullable=False),
    T.StructField("mismatch_count", T.LongType(), nullable=False),
    T.StructField("match_pct", T.DoubleType(), nullable=False),
    T.StructField("sample_mismatch_internal_ids", T.ArrayType(T.StringType()), nullable=True),
    T.StructField("_ingested_at", T.TimestampType(), nullable=False),
    T.StructField("_run_id", T.StringType(), nullable=False),
])


# ---------------------------------------------------------------------------
# Driver utilities
# ---------------------------------------------------------------------------

def build_diff(v1_df: DataFrame, v2_df: DataFrame, run_id: str,
               field_map: Optional[List[FieldPair]] = None) -> DataFrame:
    """Build the long-form diff DataFrame.

    Joins ``v1_df`` (V1 UfoEntry) and ``v2_df`` (V2 Bronze or V2 Silver) on
    :data:`JOIN_KEY` (``dossier_internal_id``). For each field in
    ``field_map`` (defaults to :data:`FIELD_MAP` + the operator-ICAO entry),
    emits one row capturing both values and the classification.

    Implementation note — all comparisons run in a single Spark job. We
    build one ``array<struct>`` column containing every per-field
    comparison, then ``explode()`` to obtain the long form. This keeps the
    plan lineage flat (no chained ``unionByName``) so the harness stays
    cheap even when the field map grows.
    """
    field_map = field_map if field_map is not None else FIELD_MAP

    # Apply V1's operator-ICAO patch to V2 so this field does not show as a
    # false-positive mismatch.
    v2_df = v2_df.withColumn(
        "operator_code_icao",
        operator_icao_alias_v1(F.col("operator_code_icao")),
    )

    joined = (
        v1_df.alias("v1")
        .join(v2_df.alias("v2"), on=JOIN_KEY, how="full_outer")
        .withColumn(
            JOIN_KEY,
            F.coalesce(F.col("v1." + JOIN_KEY), F.col("v2." + JOIN_KEY)),
        )
    )

    full_map = list(field_map) + [OPERATOR_ICAO_FIELD]

    # Each element of `comparisons` is a struct holding the per-field
    # comparison result. They are then bundled into an array column for a
    # single explode().
    comparison_structs = []
    for fp in full_map:
        v1_col = F.col("v1." + fp.v1_col)
        v2_col = F.col("v2." + fp.v2_col)
        cmp = fp.comparator(v1_col, v2_col)
        comparison_structs.append(
            F.struct(
                F.lit(fp.field_label).alias("field_name"),
                v1_col.cast(T.StringType()).alias("v1_value"),
                v2_col.cast(T.StringType()).alias("v2_value"),
                cmp.getField("matches").alias("matches"),
                cmp.getField("match_kind").alias("match_kind"),
                cmp.getField("delta").alias("delta"),
            )
        )

    bundled = joined.select(
        F.col(JOIN_KEY).alias("dossier_internal_id"),
        F.array(*comparison_structs).alias("_comparisons"),
    )

    exploded = bundled.select(
        F.col("dossier_internal_id"),
        F.explode("_comparisons").alias("c"),
    )

    return exploded.select(
        F.col("dossier_internal_id"),
        F.col("c.field_name").alias("field_name"),
        F.col("c.v1_value").alias("v1_value"),
        F.col("c.v2_value").alias("v2_value"),
        F.col("c.matches").alias("matches"),
        F.col("c.match_kind").alias("match_kind"),
        F.col("c.delta").alias("delta"),
        F.current_timestamp().alias("_ingested_at"),
        F.lit(run_id).alias("_run_id"),
    )


def build_summary(diff_df: DataFrame, run_id: str,
                  sample_size: int = 5) -> DataFrame:
    """Aggregate :func:`build_diff` output into per-field summary rows."""
    grouped = (
        diff_df.groupBy("field_name")
        .agg(
            F.count(F.lit(1)).alias("compared_count"),
            F.sum(F.when(F.col("match_kind") == "exact", 1).otherwise(0)).alias("exact_count"),
            F.sum(F.when(F.col("match_kind") == "tz_offset_equivalent", 1).otherwise(0)).alias("tz_offset_equivalent_count"),
            F.sum(F.when(F.col("match_kind") == "both_null", 1).otherwise(0)).alias("both_null_count"),
            F.sum(F.when(F.col("match_kind") == "v1_null", 1).otherwise(0)).alias("v1_null_count"),
            F.sum(F.when(F.col("match_kind") == "v2_null", 1).otherwise(0)).alias("v2_null_count"),
            F.sum(F.when(F.col("match_kind") == "mismatch", 1).otherwise(0)).alias("mismatch_count"),
            F.slice(
                F.collect_list(
                    F.when(F.col("match_kind") == "mismatch", F.col("dossier_internal_id"))
                ),
                1,
                sample_size,
            ).alias("sample_mismatch_internal_ids"),
        )
    )

    return grouped.withColumn(
        "match_pct",
        F.round(
            F.when(F.col("compared_count") == 0, F.lit(0.0))
            .otherwise(
                (F.col("exact_count") + F.col("both_null_count"))
                / F.col("compared_count")
                * F.lit(100.0)
            ),
            2,
        ),
    ).withColumn(
        "_ingested_at", F.current_timestamp()
    ).withColumn(
        "_run_id", F.lit(run_id)
    ).select(
        "field_name",
        "compared_count",
        "exact_count",
        "tz_offset_equivalent_count",
        "both_null_count",
        "v1_null_count",
        "v2_null_count",
        "mismatch_count",
        "match_pct",
        "sample_mismatch_internal_ids",
        "_ingested_at",
        "_run_id",
    )
