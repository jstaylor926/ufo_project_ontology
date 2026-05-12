"""
Bronze transform — ``tr_dossier_metadata_filtered``.

This is the wide V2 dossier-context table: post-treatment, interruption,
requestor-company, and downstream-team attribution. Bronze keeps it whole;
P3 will fan it out into UfoPostTreatment, UfoInterruption, UfoCompany, etc.
"""

from __future__ import annotations

from pyspark.sql import DataFrame, functions as F, types as T
from transforms.api import Input, Output, transform

from ._bronze_utils import (
    get_spark,
    parse_bool,
    parse_int,
    parse_string,
    parse_tz_timestamp,
    rid,
    select_with_schema,
    with_dq_columns,
)


# --- (value, tz) timestamp pairs in this table ---
_TS_PAIRS = [
    ("event_time", "event_time_tz"),
    ("interruption_sent_time", "interruption_sent_time_tz"),
    ("dossier_creation_time", "dossier_creation_time_tz"),
    ("dossier_update_time", "dossier_update_time_tz"),
    ("dossier_submit_time", "dossier_submit_time_tz"),
    ("dossier_closure_time", "dossier_closure_time_tz"),
    ("dossier_reopen_time", "dossier_reopen_time_tz"),
]


BRONZE_SCHEMA = T.StructType([
    # --- identity ---
    T.StructField("dossier_id", T.StringType(), nullable=False),
    T.StructField("dossier_internal_id", T.StringType(), nullable=True),
    T.StructField("dossier_domain", T.StringType(), nullable=True),
    T.StructField("dossier_title", T.StringType(), nullable=True),
    T.StructField("dossier_label", T.StringType(), nullable=True),
    T.StructField("dossier_channel", T.StringType(), nullable=True),
    T.StructField("is_dossier_migrated", T.BooleanType(), nullable=True),
    T.StructField("dossier_status", T.StringType(), nullable=True),
    # --- aircraft ---
    T.StructField("aircraft_program_code", T.StringType(), nullable=True),
    T.StructField("aircraft_program", T.StringType(), nullable=True),
    T.StructField("aircraft_type", T.StringType(), nullable=True),
    T.StructField("aircraft_model", T.StringType(), nullable=True),
    T.StructField("is_applicable_for_all_msn", T.BooleanType(), nullable=True),
    T.StructField("operator_code_icao", T.StringType(), nullable=True),
    T.StructField("engine_series", T.StringType(), nullable=True),
    T.StructField("engine_model", T.StringType(), nullable=True),
    T.StructField("engine_serial_number", T.StringType(), nullable=True),
    T.StructField("component_serial_number", T.StringType(), nullable=True),
    T.StructField("component_part_number", T.StringType(), nullable=True),
    T.StructField("component_FIN", T.StringType(), nullable=True),
    # --- chargeability ---
    T.StructField("is_dossier_chargeable", T.BooleanType(), nullable=True),
    T.StructField("dossier_chargeable_reason", T.StringType(), nullable=True),
    T.StructField("amm_reference", T.StringType(), nullable=True),
    T.StructField("ipc_reference", T.StringType(), nullable=True),
    T.StructField("tsm_reference", T.StringType(), nullable=True),
    # --- ATA ---
    T.StructField("ata_chapter", T.IntegerType(), nullable=True),
    T.StructField("ata_section", T.IntegerType(), nullable=True),
    T.StructField("ata_paragraph", T.IntegerType(), nullable=True),
    T.StructField("ata", T.StringType(), nullable=True),
    # --- topic taxonomy ---
    T.StructField("topic_code", T.StringType(), nullable=True),
    T.StructField("topic_code_description", T.StringType(), nullable=True),
    T.StructField("topic_reference", T.StringType(), nullable=True),
    T.StructField("sub_topic_code", T.StringType(), nullable=True),
    T.StructField("sub_topic_code_description", T.StringType(), nullable=True),
    # --- interruption ---
    T.StructField("is_operational_interruption", T.BooleanType(), nullable=True),
    T.StructField("is_technical_interruption", T.BooleanType(), nullable=True),
    T.StructField("event_time", T.TimestampType(), nullable=True),
    T.StructField("event_time_tz", T.StringType(), nullable=True),
    T.StructField("interruption_duration", T.IntegerType(), nullable=True),
    T.StructField("interruption_type", T.StringType(), nullable=True),
    T.StructField("interruption_symptom_code", T.StringType(), nullable=True),
    T.StructField("interruption_symptom_code_description", T.StringType(), nullable=True),
    T.StructField("is_interruption_etops_edto", T.BooleanType(), nullable=True),
    T.StructField("departure_airport_iata", T.StringType(), nullable=True),
    T.StructField("arrival_airport_iata", T.StringType(), nullable=True),
    T.StructField("interruption_main_base", T.StringType(), nullable=True),
    T.StructField("interruption_maintenance_action", T.StringType(), nullable=True),
    T.StructField("is_interruption_validated", T.BooleanType(), nullable=True),
    T.StructField("interruption_ata_chapter", T.IntegerType(), nullable=True),
    T.StructField("interruption_ata_section", T.IntegerType(), nullable=True),
    T.StructField("interruption_sent_time", T.TimestampType(), nullable=True),
    T.StructField("interruption_sent_time_tz", T.StringType(), nullable=True),
    T.StructField("is_interruption_sent_to_ecollection", T.BooleanType(), nullable=True),
    # --- ownership ---
    T.StructField("owner_team_name", T.StringType(), nullable=True),
    T.StructField("owner_routing_team_name", T.StringType(), nullable=True),
    # --- requestor company ---
    T.StructField("requestor_type", T.StringType(), nullable=True),
    T.StructField("requestor_company_id", T.StringType(), nullable=True),
    T.StructField("is_requestor_from_airbus", T.BooleanType(), nullable=True),
    T.StructField("requestor_company_name", T.StringType(), nullable=True),
    T.StructField("requestor_company_code_icao", T.StringType(), nullable=True),
    T.StructField("requestor_company_code_cki", T.StringType(), nullable=True),
    T.StructField("requestor_company_cage_code", T.StringType(), nullable=True),
    T.StructField("requestor_company_category", T.StringType(), nullable=True),
    T.StructField("requestor_company_arp_list_id", T.StringType(), nullable=True),
    T.StructField("requestor_company_country", T.StringType(), nullable=True),
    T.StructField("is_dossier_visible_by_external", T.BooleanType(), nullable=True),
    # --- lifecycle timestamps ---
    T.StructField("dossier_creation_time", T.TimestampType(), nullable=True),
    T.StructField("dossier_creation_time_tz", T.StringType(), nullable=True),
    T.StructField("dossier_update_time", T.TimestampType(), nullable=True),
    T.StructField("dossier_update_time_tz", T.StringType(), nullable=True),
    T.StructField("dossier_submit_time", T.TimestampType(), nullable=True),
    T.StructField("dossier_submit_time_tz", T.StringType(), nullable=True),
    T.StructField("dossier_closure_time", T.TimestampType(), nullable=True),
    T.StructField("dossier_closure_time_tz", T.StringType(), nullable=True),
    T.StructField("dossier_reopen_time", T.TimestampType(), nullable=True),
    T.StructField("dossier_reopen_time_tz", T.StringType(), nullable=True),
    # --- post-treatment ---
    T.StructField("post_treatment_status", T.StringType(), nullable=True),
    T.StructField("post_treatment_reason", T.StringType(), nullable=True),
    T.StructField("is_post_treatment_required", T.BooleanType(), nullable=True),
    T.StructField("is_post_treatment_analysis_completed", T.BooleanType(), nullable=True),
    T.StructField("is_post_treatment_sari", T.BooleanType(), nullable=True),
    T.StructField("post_treatment_sari_reference", T.StringType(), nullable=True),
    T.StructField("post_treatment_sari_link", T.StringType(), nullable=True),
    T.StructField("post_treatment_generic_occurrence", T.StringType(), nullable=True),
    T.StructField("is_post_treatment_tdo", T.BooleanType(), nullable=True),
    T.StructField("post_treatment_tdo_reference", T.StringType(), nullable=True),
    T.StructField("is_post_treatment_manufacturing_quality", T.BooleanType(), nullable=True),
    T.StructField("has_post_treatment_manufacturing_quality_reference", T.BooleanType(), nullable=True),
    T.StructField("is_post_treatment_manufacturing_quality_notification_sent", T.BooleanType(), nullable=True),
    T.StructField("has_post_treatment_environment_impact", T.BooleanType(), nullable=True),
    T.StructField("post_treatment_environment_impact", T.StringType(), nullable=True),
    T.StructField("is_post_treatment_isi", T.BooleanType(), nullable=True),
    T.StructField("post_treatment_isi_reference", T.StringType(), nullable=True),
    T.StructField("has_post_treatment_doc_content", T.BooleanType(), nullable=True),
    T.StructField("post_treatment_doc_content_reference", T.StringType(), nullable=True),
    T.StructField("is_post_treatment_doc_content_created", T.BooleanType(), nullable=True),
    # --- data-quality ---
    T.StructField("_ingested_at", T.TimestampType(), nullable=False),
    T.StructField("_source_dataset", T.StringType(), nullable=False),
    T.StructField("_row_uid", T.StringType(), nullable=False),
])


# Helper: column-name lists by parse strategy, kept here to make additions
# during the V2 contract evolution a one-line change.
_STRING_COLS = [
    "dossier_id", "dossier_internal_id", "dossier_domain", "dossier_title",
    "dossier_label", "dossier_channel", "dossier_status",
    "aircraft_program_code", "aircraft_program", "aircraft_type", "aircraft_model",
    "operator_code_icao", "engine_series", "engine_model", "engine_serial_number",
    "component_serial_number", "component_part_number", "component_FIN",
    "dossier_chargeable_reason", "amm_reference", "ipc_reference", "tsm_reference",
    "ata", "topic_code", "topic_code_description", "topic_reference",
    "sub_topic_code", "sub_topic_code_description",
    "interruption_type", "interruption_symptom_code", "interruption_symptom_code_description",
    "departure_airport_iata", "arrival_airport_iata", "interruption_main_base",
    "interruption_maintenance_action",
    "owner_team_name", "owner_routing_team_name",
    "requestor_type", "requestor_company_id", "requestor_company_name",
    "requestor_company_code_icao", "requestor_company_code_cki",
    "requestor_company_cage_code", "requestor_company_category",
    "requestor_company_arp_list_id", "requestor_company_country",
    "post_treatment_status", "post_treatment_reason",
    "post_treatment_sari_reference", "post_treatment_sari_link",
    "post_treatment_generic_occurrence", "post_treatment_tdo_reference",
    "post_treatment_environment_impact", "post_treatment_isi_reference",
    "post_treatment_doc_content_reference",
]

_BOOL_COLS = [
    "is_dossier_migrated", "is_applicable_for_all_msn", "is_dossier_chargeable",
    "is_operational_interruption", "is_technical_interruption",
    "is_interruption_etops_edto", "is_interruption_validated",
    "is_interruption_sent_to_ecollection",
    "is_requestor_from_airbus", "is_dossier_visible_by_external",
    "is_post_treatment_required", "is_post_treatment_analysis_completed",
    "is_post_treatment_sari", "is_post_treatment_tdo",
    "is_post_treatment_manufacturing_quality",
    "has_post_treatment_manufacturing_quality_reference",
    "is_post_treatment_manufacturing_quality_notification_sent",
    "has_post_treatment_environment_impact",
    "is_post_treatment_isi", "has_post_treatment_doc_content",
    "is_post_treatment_doc_content_created",
]

_INT_COLS = [
    "ata_chapter", "ata_section", "ata_paragraph",
    "interruption_duration", "interruption_ata_chapter", "interruption_ata_section",
]


def _transform(df: DataFrame) -> DataFrame:
    """Apply the Bronze contract to the wide dossier-metadata table."""
    selections = []
    for c in _STRING_COLS:
        selections.append(parse_string(c).alias(c))
    for c in _BOOL_COLS:
        selections.append(parse_bool(c).alias(c))
    for c in _INT_COLS:
        selections.append(parse_int(c).alias(c))

    for value_col, tz_col in _TS_PAIRS:
        selections.append(parse_tz_timestamp(value_col, tz_col).alias(value_col))
        selections.append(parse_string(tz_col).alias(tz_col))

    typed = df.select(*selections)
    enriched = with_dq_columns(typed, source_dataset_name="raw.dossier_metadata")
    return select_with_schema(enriched, BRONZE_SCHEMA)


@transform(
    output=Output(rid("bronze.dossier_metadata")),
    source_df=Input(rid("raw.dossier_metadata")),
)
def compute(output, source_df):
    """Driver — see ``bronze_techrequest_index.compute``."""
    get_spark("UFO-V2-Bronze-DossierMetadata")
    df = source_df.dataframe()
    output.write_dataframe(_transform(df))
