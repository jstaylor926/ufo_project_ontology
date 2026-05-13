"""
Local runner — ``v2_bronze.bronze_techrequest_index``.

Reads ``Data/techrequest_index_metadata_v2.csv`` and writes parquet to
``Practice_Run/output/bronze_techrequest_index/``.

Usage::

    python -m runners.run_bronze_techrequest_index
    # or
    python Practice_Run/runners/run_bronze_techrequest_index.py
"""

from __future__ import annotations

# Path bootstrap must happen before any v2_bronze import.
from _common import bootstrap_paths, get_local_spark, read_csv_as_strings, write_parquet

bootstrap_paths()

from config import dataset_path, ensure_output_dir  # noqa: E402
from v2_bronze import bronze_techrequest_index as mod  # noqa: E402


# Column list comes straight from the CSV header (mirrors the V2 contract).
INPUT_COLUMNS = [
    "dossier_id", "dossier_internal_id", "dossier_domain", "dossier_title",
    "dossier_label", "dossier_channel", "is_dossier_migrated", "dossier_status",
    "aircraft_program_code", "aircraft_program", "manufacturer_aircraft_id",
    "skywise_aircraft_id", "is_applicable_for_all_msn", "aircraft_msn",
    "aircraft_type", "aircraft_model", "registration_number",
    "aircraft_flight_hours", "aircraft_flight_cycles", "operator_code_icao",
    "engine_series", "engine_model", "component_serial_number",
    "component_part_number", "component_flight_cycles", "component_flight_hours",
    "component_FIN", "ata_chapter", "ata",
    "requestor_company_code_icao", "visible_by_company_code_icao",
    "creation_time", "creation_time_tz", "update_time", "update_time_tz",
    "submit_time", "submit_time_tz", "closure_time", "closure_time_tz",
    "number_total_messages", "number_closed_messages",
    "message_soonest_requested_answer_time",
    "message_soonest_requested_answer_time_tz",
    "highest_message_urgency", "is_message_open",
    "has_approval_doc", "approval_doc_type",
]


def main() -> None:
    ensure_output_dir()
    spark = get_local_spark("UFO-V2-Bronze-TechRequestIndex")

    src = read_csv_as_strings(spark, dataset_path("raw.techrequest_index"), INPUT_COLUMNS)
    out_df = mod._transform(src)

    sink = write_parquet(out_df, dataset_path("bronze.techrequest_index"))
    print(f"[bronze.techrequest_index] rows={out_df.count()} -> {sink}")


if __name__ == "__main__":
    main()
