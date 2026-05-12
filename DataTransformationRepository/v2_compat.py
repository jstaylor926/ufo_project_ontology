"""
V1 ↔ V2 schema compatibility shim for the V1 PySpark transforms.

Purpose
-------
The V1 transforms (UFOEntries.py, MessageParsing.py, ApprDoc.py, …) were
written against the V1 TechRequest column names. When the upstream dataset
is rebound to a TechRequest V2 source — either the raw V2 feed or the
v2_bronze.* outputs — column names change to snake_case and every
timestamp ships as a (value, *_tz) pair.

This module is a *forward-compatibility shim*. Each V1 transform now calls
one of the ``maybe_normalize_*`` entry points at the top of its compute().
If V2 columns are present, the shim renames them to V1 spelling and folds
each (value, *_tz) pair into a single ``TimestampType`` column at the V1
column name. If V1 columns are already present, the input passes through
unchanged.

V1 transform logic is **not** modified — it continues to read V1 column
names. The shim is the only V2 awareness in the V1 repo.

Design notes
------------
* Column renames are idempotent. If both V1 and V2 names are present (won't
  happen in practice but cheap to guard against), the V1 name wins.
* (value, *_tz) pairs are combined by concatenating the value with the
  offset, then ``to_timestamp`` — same contract as ``v2_bronze._bronze_utils``
  uses, so any consumer that joins to a Bronze output sees identical
  timestamps.
* This module imports only ``pyspark.sql`` — it is safe to import from any
  V1 transform without pulling in v2_bronze / v2_parity machinery.

Out of scope
------------
V2-only fields (post_treatment_*, interruption_*, topic_code, …) are
ignored. The V1 transforms do not consume them; the V2 ontology re-shape
(Phase 3) is the proper home for those fields.
"""

from __future__ import annotations

from typing import Mapping

from pyspark.sql import DataFrame
from pyspark.sql import functions as F
from pyspark.sql import types as T


# ---------------------------------------------------------------------------
# V2 → V1 column-name mappings
# ---------------------------------------------------------------------------
# Keys are V2 column names (as produced by the v2_bronze package or the
# raw V2 CSV). Values are the V1 column names the V1 transforms expect.

# Mapping for the dossier index feed (UFOEntries.py).
V2_TO_V1_DOSSIER_INDEX: Mapping[str, str] = {
    "dossier_id": "id_dossier",
    "dossier_title": "dossierTitle",
    "dossier_label": "dossierLabel",
    "dossier_status": "dossierStatus",
    "dossier_domain": "dossier_domain",       # already same shape
    "dossier_channel": "dossier_channel",     # already same shape
    "is_dossier_migrated": "is_dossier_migrated",
    "aircraft_program_code": "aircraftProgramLetter",
    "aircraft_program": "aircraftProgram",
    "manufacturer_aircraft_id": "id_aircraft",
    "skywise_aircraft_id": "skywise_aircraft_id",
    "is_applicable_for_all_msn": "isapplicable_forAll_MSN",
    "aircraft_msn": "msn",
    "aircraft_type": "aircraft_type",
    "aircraft_model": "aircraft_model",
    "registration_number": "registration_number",
    "aircraft_flight_hours": "aircraftFlightHours",
    "aircraft_flight_cycles": "aircraftFlightCycles",
    "operator_code_icao": "operatorICAOCode",
    "engine_series": "engineSeries",
    "engine_model": "engineModel",
    "component_serial_number": "component_serialNumber",
    "component_part_number": "component_partNumber",
    "component_flight_cycles": "componentFlightCycles",
    "component_flight_hours": "componentFlightHours",
    "component_FIN": "component_FIN",
    "ata_chapter": "ataChapter",
    "ata": "ata4D",
    "requestor_company_code_icao": "dossier_RequestorICAOCode",
    "visible_by_company_code_icao": "dossier_VisibleByICAOCode",
    "number_total_messages": "messageTotalNumber",
    "number_closed_messages": "messageClosedNumber",
    "highest_message_urgency": "messageHighestUrgency",
    "is_message_open": "is_messageOpen",
    "has_approval_doc": "has_approval_doc",
    "approval_doc_type": "approval_doc_type",
}

# Mapping for the messages feed (MessageParsing.py).
V2_TO_V1_MESSAGES: Mapping[str, str] = {
    "message_id": "id_message",
    "dossier_id": "id_dossier",
    "message_title": "messageTitle",
    "message_status": "messageStatus",
    "from_partner_type": "messageFrom_partnerType",
    "from_company_name": "messageFrom_companyName",
    "to_partner_type": "messageTo_partnerType",
    "to_company_name": "messageTo_companyName",
    "operator_code_icao": "operatorICAOCode",
    "is_message_acknowledged": "is_messageAcknowledge",
}

# Mapping for the approval-doc feed (ApprDoc.py).
V2_TO_V1_APPROVAL: Mapping[str, str] = {
    "dossier_id": "id_dossier",
    # The V2 approval-doc dataset is not part of the Phase 1 Bronze layer;
    # the renames below cover the columns that already appear in V1's
    # `ApprDoc.py` should they be re-emitted with V2 spelling.
    "approval_doc_id": "approvalDoc_id",
    "approval_doc_status": "approvalDocStatus",
    "approval_doc_type": "approvalDocType",
    "approval_doc_category": "approvalDocCategory",
    "approval_doc_issue": "approvalDocIssue",
    "limitation_type": "limitation_type",
    "rdaf_type": "rdaf_type",
}


# ---------------------------------------------------------------------------
# (value, *_tz) timestamp pairs — V2 split into two columns, V1 expects one.
# ---------------------------------------------------------------------------
# Each entry: (v2_value_column, v2_tz_column, v1_output_column)
DOSSIER_INDEX_TS_PAIRS = [
    ("creation_time", "creation_time_tz", "dossierCreationDate"),
    ("update_time", "update_time_tz", "dossierUpdateDate"),
    ("submit_time", "submit_time_tz", "dossierSubmitDate"),
    ("closure_time", "closure_time_tz", "dossierClosureDate"),
    (
        "message_soonest_requested_answer_time",
        "message_soonest_requested_answer_time_tz",
        "messageSoonestRequestDate",
    ),
]

MESSAGES_TS_PAIRS = [
    ("creation_time", "creation_time_tz", "messageCreationDate"),
    ("submit_time", "submit_time_tz", "messageSubmitDate"),
    ("acknowledged_time", "acknowledged_time_tz", "messageAcknowledgedDate"),
]

APPROVAL_TS_PAIRS = [
    ("target_date", "target_date_tz", "target_date"),
    ("end_target_date", "end_target_date_tz", "end_target_date"),
    ("approval_date", "approval_date_tz", "approval_date"),
    ("assigned_date", "assigned_date_tz", "assigned_date"),
]


# ---------------------------------------------------------------------------
# Schema-detection helpers
# ---------------------------------------------------------------------------

def is_v2_dossier_index(df: DataFrame) -> bool:
    """True if the dossier-index input looks like V2 (snake_case)."""
    return "dossier_id" in df.columns and "id_dossier" not in df.columns


def is_v2_messages(df: DataFrame) -> bool:
    """True if the messages input looks like V2."""
    return "message_id" in df.columns and "id_message" not in df.columns


def is_v2_approval(df: DataFrame) -> bool:
    """True if the approval-doc input looks like V2."""
    return "dossier_id" in df.columns and "id_dossier" not in df.columns


# ---------------------------------------------------------------------------
# Renaming + TZ normalization
# ---------------------------------------------------------------------------

def _rename_columns(
    df: DataFrame, mapping: Mapping[str, str]
) -> DataFrame:
    """Apply a V2 → V1 rename, but only if the V1 target name isn't present."""
    for v2_name, v1_name in mapping.items():
        if v2_name in df.columns and v1_name not in df.columns:
            df = df.withColumnRenamed(v2_name, v1_name)
        elif v2_name in df.columns and v2_name != v1_name:
            # V1 name already exists alongside — drop the V2 duplicate.
            df = df.drop(v2_name)
    return df


def _combine_tz_pair(
    df: DataFrame, value_col: str, tz_col: str, output_col: str
) -> DataFrame:
    """Combine a V2 (value, *_tz) string pair into one TimestampType column.

    * NULL-safe: empty value → NULL output.
    * Missing offset → assumed UTC.
    * Output overwrites ``output_col`` if it exists.
    """
    if value_col not in df.columns:
        return df

    value = F.col(value_col)
    if tz_col in df.columns:
        tz = F.coalesce(
            F.nullif(F.col(tz_col), F.lit("")), F.lit("+00:00")
        )
    else:
        tz = F.lit("+00:00")

    cleaned = F.regexp_replace(value, " ", "T")
    is_null = value.isNull() | (F.trim(value) == "")
    iso = F.concat(cleaned, tz)
    parsed = F.when(is_null, F.lit(None).cast(T.TimestampType())).otherwise(
        F.to_timestamp(iso)
    )
    df = df.withColumn(output_col, parsed)

    # Tidy: drop the V2-named columns once we've combined them.
    if value_col != output_col and value_col in df.columns:
        df = df.drop(value_col)
    if tz_col in df.columns:
        df = df.drop(tz_col)
    return df


def normalize_v2_dossier_index(df: DataFrame) -> DataFrame:
    """Convert a V2-shaped dossier-index DataFrame to V1 spelling."""
    df = _rename_columns(df, V2_TO_V1_DOSSIER_INDEX)
    for v2_val, v2_tz, v1_out in DOSSIER_INDEX_TS_PAIRS:
        df = _combine_tz_pair(df, v2_val, v2_tz, v1_out)
    return df


def normalize_v2_messages(df: DataFrame) -> DataFrame:
    """Convert a V2-shaped messages DataFrame to V1 spelling."""
    df = _rename_columns(df, V2_TO_V1_MESSAGES)
    for v2_val, v2_tz, v1_out in MESSAGES_TS_PAIRS:
        df = _combine_tz_pair(df, v2_val, v2_tz, v1_out)
    return df


def normalize_v2_approval(df: DataFrame) -> DataFrame:
    """Convert a V2-shaped approval-doc DataFrame to V1 spelling."""
    df = _rename_columns(df, V2_TO_V1_APPROVAL)
    for v2_val, v2_tz, v1_out in APPROVAL_TS_PAIRS:
        df = _combine_tz_pair(df, v2_val, v2_tz, v1_out)
    return df


# ---------------------------------------------------------------------------
# Auto-detect entry points
# ---------------------------------------------------------------------------

def maybe_normalize_dossier_index(df: DataFrame) -> DataFrame:
    """Auto-detect V2 dossier-index schema and normalize. Passthrough on V1."""
    return normalize_v2_dossier_index(df) if is_v2_dossier_index(df) else df


def maybe_normalize_messages(df: DataFrame) -> DataFrame:
    """Auto-detect V2 messages schema and normalize. Passthrough on V1."""
    return normalize_v2_messages(df) if is_v2_messages(df) else df


def maybe_normalize_approval(df: DataFrame) -> DataFrame:
    """Auto-detect V2 approval schema and normalize. Passthrough on V1."""
    return normalize_v2_approval(df) if is_v2_approval(df) else df
