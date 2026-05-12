"""
Bronze transform — ``techrequest_index_metadata_v2``.

This is the top-level dossier index for TechRequest V2. The schema below is
the *canonical* Bronze contract for the dossier spine; every other Bronze
table either joins to it on ``dossier_id`` or supplies side-information.

V1 mapping reminders (kept here so reviewers can cross-reference, **not**
applied as transformations — Bronze is content-preserving):

================================  ===================================
V1 column                          V2 column
================================  ===================================
id_dossier                         dossier_id
dossierTitle                       dossier_title
operatorICAOCode                   operator_code_icao
msn                                aircraft_msn
ataChapter / ata_4d                ata_chapter / ata
dossUpdateDate / *_tz pair         update_time + update_time_tz
================================  ===================================
"""

from __future__ import annotations

from pyspark.sql import DataFrame, functions as F, types as T
from transforms.api import Input, Output, transform

from ._bronze_utils import (
    get_spark,
    parse_bool,
    parse_double,
    parse_int,
    parse_int_array,
    parse_str_array,
    parse_string,
    parse_tz_timestamp,
    rid,
    select_with_schema,
    with_dq_columns,
)


BRONZE_SCHEMA = T.StructType([
    # --- identity ---
    T.StructField("dossier_id", T.StringType(), nullable=False),
    T.StructField("dossier_internal_id", T.StringType(), nullable=True),
    # --- classification ---
    T.StructField("dossier_domain", T.StringType(), nullable=True),
    T.StructField("dossier_title", T.StringType(), nullable=True),
    T.StructField("dossier_label", T.StringType(), nullable=True),
    T.StructField("dossier_channel", T.StringType(), nullable=True),
    T.StructField("is_dossier_migrated", T.BooleanType(), nullable=True),
    T.StructField("dossier_status", T.StringType(), nullable=True),
    # --- aircraft ---
    T.StructField("aircraft_program_code", T.StringType(), nullable=True),
    T.StructField("aircraft_program", T.StringType(), nullable=True),
    T.StructField("manufacturer_aircraft_id", T.ArrayType(T.StringType()), nullable=True),
    T.StructField("skywise_aircraft_id", T.ArrayType(T.StringType()), nullable=True),
    T.StructField("is_applicable_for_all_msn", T.BooleanType(), nullable=True),
    T.StructField("aircraft_msn", T.ArrayType(T.IntegerType()), nullable=True),
    T.StructField("aircraft_type", T.StringType(), nullable=True),
    T.StructField("aircraft_model", T.StringType(), nullable=True),
    T.StructField("registration_number", T.StringType(), nullable=True),
    T.StructField("aircraft_flight_hours", T.DoubleType(), nullable=True),
    T.StructField("aircraft_flight_cycles", T.IntegerType(), nullable=True),
    T.StructField("operator_code_icao", T.StringType(), nullable=True),
    # --- powerplant / components ---
    T.StructField("engine_series", T.StringType(), nullable=True),
    T.StructField("engine_model", T.StringType(), nullable=True),
    T.StructField("component_serial_number", T.StringType(), nullable=True),
    T.StructField("component_part_number", T.StringType(), nullable=True),
    T.StructField("component_flight_cycles", T.IntegerType(), nullable=True),
    T.StructField("component_flight_hours", T.DoubleType(), nullable=True),
    T.StructField("component_FIN", T.StringType(), nullable=True),
    # --- ATA reference ---
    T.StructField("ata_chapter", T.IntegerType(), nullable=True),
    T.StructField("ata", T.StringType(), nullable=True),
    # --- parties ---
    T.StructField("requestor_company_code_icao", T.StringType(), nullable=True),
    T.StructField("visible_by_company_code_icao", T.ArrayType(T.StringType()), nullable=True),
    # --- lifecycle timestamps (UTC) + raw offsets retained ---
    T.StructField("creation_time", T.TimestampType(), nullable=True),
    T.StructField("creation_time_tz", T.StringType(), nullable=True),
    T.StructField("update_time", T.TimestampType(), nullable=True),
    T.StructField("update_time_tz", T.StringType(), nullable=True),
    T.StructField("submit_time", T.TimestampType(), nullable=True),
    T.StructField("submit_time_tz", T.StringType(), nullable=True),
    T.StructField("closure_time", T.TimestampType(), nullable=True),
    T.StructField("closure_time_tz", T.StringType(), nullable=True),
    # --- message rollups ---
    T.StructField("number_total_messages", T.IntegerType(), nullable=True),
    T.StructField("number_closed_messages", T.IntegerType(), nullable=True),
    T.StructField("message_soonest_requested_answer_time", T.TimestampType(), nullable=True),
    T.StructField("message_soonest_requested_answer_time_tz", T.StringType(), nullable=True),
    T.StructField("highest_message_urgency", T.StringType(), nullable=True),
    T.StructField("is_message_open", T.BooleanType(), nullable=True),
    T.StructField("has_approval_doc", T.BooleanType(), nullable=True),
    T.StructField("approval_doc_type", T.ArrayType(T.StringType()), nullable=True),
    # --- data-quality (appended by with_dq_columns) ---
    T.StructField("_ingested_at", T.TimestampType(), nullable=False),
    T.StructField("_source_dataset", T.StringType(), nullable=False),
    T.StructField("_row_uid", T.StringType(), nullable=False),
])


def _transform(df: DataFrame) -> DataFrame:
    """Apply the Bronze contract.

    * Cast every column from the raw all-string input to its target type.
    * Normalize all four (value, tz) timestamp pairs to UTC.
    * Parse the three array-encoded string columns.
    """
    typed = df.select(
        parse_string("dossier_id").alias("dossier_id"),
        parse_string("dossier_internal_id").alias("dossier_internal_id"),
        parse_string("dossier_domain").alias("dossier_domain"),
        parse_string("dossier_title").alias("dossier_title"),
        parse_string("dossier_label").alias("dossier_label"),
        parse_string("dossier_channel").alias("dossier_channel"),
        parse_bool("is_dossier_migrated").alias("is_dossier_migrated"),
        parse_string("dossier_status").alias("dossier_status"),
        parse_string("aircraft_program_code").alias("aircraft_program_code"),
        parse_string("aircraft_program").alias("aircraft_program"),
        parse_str_array("manufacturer_aircraft_id").alias("manufacturer_aircraft_id"),
        parse_str_array("skywise_aircraft_id").alias("skywise_aircraft_id"),
        parse_bool("is_applicable_for_all_msn").alias("is_applicable_for_all_msn"),
        parse_int_array("aircraft_msn").alias("aircraft_msn"),
        parse_string("aircraft_type").alias("aircraft_type"),
        parse_string("aircraft_model").alias("aircraft_model"),
        parse_string("registration_number").alias("registration_number"),
        parse_double("aircraft_flight_hours").alias("aircraft_flight_hours"),
        parse_int("aircraft_flight_cycles").alias("aircraft_flight_cycles"),
        parse_string("operator_code_icao").alias("operator_code_icao"),
        parse_string("engine_series").alias("engine_series"),
        parse_string("engine_model").alias("engine_model"),
        parse_string("component_serial_number").alias("component_serial_number"),
        parse_string("component_part_number").alias("component_part_number"),
        parse_int("component_flight_cycles").alias("component_flight_cycles"),
        parse_double("component_flight_hours").alias("component_flight_hours"),
        parse_string("component_FIN").alias("component_FIN"),
        parse_int("ata_chapter").alias("ata_chapter"),
        parse_string("ata").alias("ata"),
        parse_string("requestor_company_code_icao").alias("requestor_company_code_icao"),
        parse_str_array("visible_by_company_code_icao").alias("visible_by_company_code_icao"),
        parse_tz_timestamp("creation_time", "creation_time_tz").alias("creation_time"),
        parse_string("creation_time_tz").alias("creation_time_tz"),
        parse_tz_timestamp("update_time", "update_time_tz").alias("update_time"),
        parse_string("update_time_tz").alias("update_time_tz"),
        parse_tz_timestamp("submit_time", "submit_time_tz").alias("submit_time"),
        parse_string("submit_time_tz").alias("submit_time_tz"),
        parse_tz_timestamp("closure_time", "closure_time_tz").alias("closure_time"),
        parse_string("closure_time_tz").alias("closure_time_tz"),
        parse_int("number_total_messages").alias("number_total_messages"),
        parse_int("number_closed_messages").alias("number_closed_messages"),
        parse_tz_timestamp(
            "message_soonest_requested_answer_time",
            "message_soonest_requested_answer_time_tz",
        ).alias("message_soonest_requested_answer_time"),
        parse_string("message_soonest_requested_answer_time_tz").alias(
            "message_soonest_requested_answer_time_tz"
        ),
        parse_string("highest_message_urgency").alias("highest_message_urgency"),
        parse_bool("is_message_open").alias("is_message_open"),
        parse_bool("has_approval_doc").alias("has_approval_doc"),
        parse_str_array("approval_doc_type").alias("approval_doc_type"),
    )

    enriched = with_dq_columns(typed, source_dataset_name="raw.techrequest_index")
    return select_with_schema(enriched, BRONZE_SCHEMA)


@transform(
    output=Output(rid("bronze.techrequest_index")),
    source_df=Input(rid("raw.techrequest_index")),
)
def compute(output, source_df):
    """Driver entry point.

    Foundry calls this with the raw input dataset and the Bronze output
    dataset. The Spark session is created with UTC session timezone so that
    every ``to_timestamp`` call below resolves to UTC instants.
    """
    get_spark("UFO-V2-Bronze-TechRequestIndex")
    df = source_df.dataframe()
    output.write_dataframe(_transform(df))
