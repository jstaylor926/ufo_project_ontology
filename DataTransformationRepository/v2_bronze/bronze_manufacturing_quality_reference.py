"""
Bronze transform — ``tr_manufacturing_quality_reference``.

Slim Skywise RFI register linking a dossier to its manufacturing-quality
RFI message. Six columns; one (value, tz) pair to normalize. Becomes the
source for the ``UfoManufacturingQualityRfi`` object type in P3.
"""

from __future__ import annotations

from pyspark.sql import DataFrame, types as T
from transforms.api import Input, Output, transform

from ._bronze_utils import (
    get_spark,
    parse_string,
    parse_tz_timestamp,
    rid,
    select_with_schema,
    with_dq_columns,
)


BRONZE_SCHEMA = T.StructType([
    T.StructField("skywise_rfi_id", T.StringType(), nullable=False),
    T.StructField("dossier_id", T.StringType(), nullable=False),
    T.StructField("dossier_internal_id", T.StringType(), nullable=True),
    T.StructField("rfi_message_id", T.StringType(), nullable=True),
    T.StructField("rfi_creation_time", T.TimestampType(), nullable=True),
    T.StructField("rfi_creation_time_tz", T.StringType(), nullable=True),
    T.StructField("_ingested_at", T.TimestampType(), nullable=False),
    T.StructField("_source_dataset", T.StringType(), nullable=False),
    T.StructField("_row_uid", T.StringType(), nullable=False),
])


def _transform(df: DataFrame) -> DataFrame:
    typed = df.select(
        parse_string("skywise_rfi_id").alias("skywise_rfi_id"),
        parse_string("dossier_id").alias("dossier_id"),
        parse_string("dossier_internal_id").alias("dossier_internal_id"),
        parse_string("rfi_message_id").alias("rfi_message_id"),
        parse_tz_timestamp("rfi_creation_time", "rfi_creation_time_tz").alias("rfi_creation_time"),
        parse_string("rfi_creation_time_tz").alias("rfi_creation_time_tz"),
    )
    enriched = with_dq_columns(typed, source_dataset_name="raw.manufacturing_quality_reference")
    return select_with_schema(enriched, BRONZE_SCHEMA)


@transform(
    output=Output(rid("bronze.manufacturing_quality_reference")),
    source_df=Input(rid("raw.manufacturing_quality_reference")),
)
def compute(output, source_df):
    get_spark("UFO-V2-Bronze-MfgQualityReference")
    df = source_df.dataframe()
    output.write_dataframe(_transform(df))
