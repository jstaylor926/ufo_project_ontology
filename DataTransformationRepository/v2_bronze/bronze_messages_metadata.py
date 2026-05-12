"""
Bronze transform — ``tr_messages_metadata``.

V2 message dataset. Key identifier rename ``id_message → message_id``.
Introduces explicit message-type / sub-type and a richer planned/requested
answer timestamp set (each value paired with a ``*_tz`` offset column).
"""

from __future__ import annotations

from pyspark.sql import DataFrame, functions as F, types as T
from transforms.api import Input, Output, transform

from ._bronze_utils import (
    get_spark,
    parse_bool,
    parse_string,
    parse_str_array,
    parse_tz_timestamp,
    rid,
    select_with_schema,
    with_dq_columns,
)


_TS_PAIRS = [
    ("first_requested_answer_time", "first_requested_answer_time_tz"),
    ("requested_answer_time", "requested_answer_time_tz"),
    ("acknowledged_time", "acknowledged_time_tz"),
    ("creation_time", "creation_time_tz"),
    ("last_update_time", "last_update_time_tz"),
    ("status_change_time", "status_change_time_tz"),
    ("commit_time", "commit_time_tz"),
    ("submit_time", "submit_time_tz"),
    ("answer_time", "answer_time_tz"),
    ("first_planned_answer_time", "first_planned_answer_time_tz"),
    ("planned_answer_time", "planned_answer_time_tz"),
]


BRONZE_SCHEMA = T.StructType([
    # --- identity ---
    T.StructField("message_id", T.StringType(), nullable=False),
    T.StructField("message_internal_id", T.StringType(), nullable=True),
    T.StructField("dossier_id", T.StringType(), nullable=False),
    T.StructField("dossier_internal_id", T.StringType(), nullable=True),
    T.StructField("dossier_domain", T.StringType(), nullable=True),
    # --- envelope ---
    T.StructField("message_title", T.StringType(), nullable=True),
    T.StructField("message_status", T.StringType(), nullable=True),
    T.StructField("message_type", T.StringType(), nullable=True),
    T.StructField("message_sub_type", T.StringType(), nullable=True),
    # --- routing ---
    T.StructField("from_partner_type", T.StringType(), nullable=True),
    T.StructField("from_company_name", T.StringType(), nullable=True),
    T.StructField("from_company_id", T.StringType(), nullable=True),
    T.StructField("to_partner_type", T.StringType(), nullable=True),
    T.StructField("to_company_name", T.StringType(), nullable=True),
    T.StructField("to_company_id", T.StringType(), nullable=True),
    T.StructField("is_from_dossier_owner", T.BooleanType(), nullable=True),
    T.StructField("is_to_dossier_owner", T.BooleanType(), nullable=True),
    T.StructField("is_from_airbus", T.BooleanType(), nullable=True),
    T.StructField("message_visibility", T.StringType(), nullable=True),
    T.StructField("visible_by_company_name", T.ArrayType(T.StringType()), nullable=True),
    T.StructField("visible_by_company_id", T.ArrayType(T.StringType()), nullable=True),
    # --- request lifecycle ---
    T.StructField("first_requested_answer_time", T.TimestampType(), nullable=True),
    T.StructField("first_requested_answer_time_tz", T.StringType(), nullable=True),
    T.StructField("requested_answer_time", T.TimestampType(), nullable=True),
    T.StructField("requested_answer_time_tz", T.StringType(), nullable=True),
    T.StructField("urgency", T.StringType(), nullable=True),
    T.StructField("message_label", T.StringType(), nullable=True),
    T.StructField("is_message_acknowledged", T.BooleanType(), nullable=True),
    T.StructField("acknowledged_time", T.TimestampType(), nullable=True),
    T.StructField("acknowledged_time_tz", T.StringType(), nullable=True),
    T.StructField("is_message_new", T.BooleanType(), nullable=True),
    T.StructField("is_message_final_answer", T.BooleanType(), nullable=True),
    T.StructField("message_answer_id", T.StringType(), nullable=True),
    T.StructField("message_answer_internal_id", T.StringType(), nullable=True),
    # --- timestamps ---
    T.StructField("creation_time", T.TimestampType(), nullable=True),
    T.StructField("creation_time_tz", T.StringType(), nullable=True),
    T.StructField("last_update_time", T.TimestampType(), nullable=True),
    T.StructField("last_update_time_tz", T.StringType(), nullable=True),
    T.StructField("status_change_time", T.TimestampType(), nullable=True),
    T.StructField("status_change_time_tz", T.StringType(), nullable=True),
    T.StructField("commit_time", T.TimestampType(), nullable=True),
    T.StructField("commit_time_tz", T.StringType(), nullable=True),
    T.StructField("submit_time", T.TimestampType(), nullable=True),
    T.StructField("submit_time_tz", T.StringType(), nullable=True),
    T.StructField("answer_time", T.TimestampType(), nullable=True),
    T.StructField("answer_time_tz", T.StringType(), nullable=True),
    T.StructField("first_planned_answer_time", T.TimestampType(), nullable=True),
    T.StructField("first_planned_answer_time_tz", T.StringType(), nullable=True),
    T.StructField("planned_answer_time", T.TimestampType(), nullable=True),
    T.StructField("planned_answer_time_tz", T.StringType(), nullable=True),
    # --- references ---
    T.StructField("external_reference", T.StringType(), nullable=True),
    T.StructField("quotation_number", T.StringType(), nullable=True),
    T.StructField("quotation_area", T.StringType(), nullable=True),
    T.StructField("quotation_version", T.StringType(), nullable=True),
    T.StructField("skywise_solution_deliverable_id", T.StringType(), nullable=True),
    # --- data-quality ---
    T.StructField("_ingested_at", T.TimestampType(), nullable=False),
    T.StructField("_source_dataset", T.StringType(), nullable=False),
    T.StructField("_row_uid", T.StringType(), nullable=False),
])


_STRING_COLS = [
    "message_id", "message_internal_id", "dossier_id", "dossier_internal_id",
    "dossier_domain", "message_title", "message_status", "message_type",
    "message_sub_type", "from_partner_type", "from_company_name", "from_company_id",
    "to_partner_type", "to_company_name", "to_company_id",
    "message_visibility", "urgency", "message_label",
    "message_answer_id", "message_answer_internal_id",
    "external_reference", "quotation_number", "quotation_area",
    "quotation_version", "skywise_solution_deliverable_id",
]

_BOOL_COLS = [
    "is_from_dossier_owner", "is_to_dossier_owner", "is_from_airbus",
    "is_message_acknowledged", "is_message_new", "is_message_final_answer",
]

_ARRAY_STR_COLS = [
    "visible_by_company_name",
    "visible_by_company_id",
]


def _transform(df: DataFrame) -> DataFrame:
    selections = []
    for c in _STRING_COLS:
        selections.append(parse_string(c).alias(c))
    for c in _BOOL_COLS:
        selections.append(parse_bool(c).alias(c))
    for c in _ARRAY_STR_COLS:
        selections.append(parse_str_array(c).alias(c))
    for value_col, tz_col in _TS_PAIRS:
        selections.append(parse_tz_timestamp(value_col, tz_col).alias(value_col))
        selections.append(parse_string(tz_col).alias(tz_col))

    typed = df.select(*selections)
    enriched = with_dq_columns(typed, source_dataset_name="raw.messages_metadata")
    return select_with_schema(enriched, BRONZE_SCHEMA)


@transform(
    output=Output(rid("bronze.messages_metadata")),
    source_df=Input(rid("raw.messages_metadata")),
)
def compute(output, source_df):
    get_spark("UFO-V2-Bronze-MessagesMetadata")
    df = source_df.dataframe()
    output.write_dataframe(_transform(df))
