"""
Bronze transform — ``tr_linked_dossier``.

Dossier-to-dossier link register. ``linked_type`` is one of ``Move`` or
``Copy`` (so far). In P3 this becomes a many-to-many UfoEntry ↔ UfoEntry
Link Type with ``linked_type`` carried as a link property.

The table has no timestamps; it is pure relational metadata.
"""

from __future__ import annotations

from pyspark.sql import DataFrame, types as T
from transforms.api import Input, Output, transform

from ._bronze_utils import (
    get_spark,
    parse_string,
    rid,
    select_with_schema,
    with_dq_columns,
)


BRONZE_SCHEMA = T.StructType([
    T.StructField("skywise_link_id", T.StringType(), nullable=False),
    T.StructField("dossier_id", T.StringType(), nullable=False),
    T.StructField("dossier_internal_id", T.StringType(), nullable=True),
    T.StructField("dossier_domain", T.StringType(), nullable=True),
    T.StructField("linked_dossier_id", T.StringType(), nullable=False),
    T.StructField("linked_dossier_internal_id", T.StringType(), nullable=True),
    T.StructField("linked_dossier_domain", T.StringType(), nullable=True),
    T.StructField("linked_type", T.StringType(), nullable=True),
    T.StructField("_ingested_at", T.TimestampType(), nullable=False),
    T.StructField("_source_dataset", T.StringType(), nullable=False),
    T.StructField("_row_uid", T.StringType(), nullable=False),
])


def _transform(df: DataFrame) -> DataFrame:
    typed = df.select(
        parse_string("skywise_link_id").alias("skywise_link_id"),
        parse_string("dossier_id").alias("dossier_id"),
        parse_string("dossier_internal_id").alias("dossier_internal_id"),
        parse_string("dossier_domain").alias("dossier_domain"),
        parse_string("linked_dossier_id").alias("linked_dossier_id"),
        parse_string("linked_dossier_internal_id").alias("linked_dossier_internal_id"),
        parse_string("linked_dossier_domain").alias("linked_dossier_domain"),
        parse_string("linked_type").alias("linked_type"),
    )
    enriched = with_dq_columns(typed, source_dataset_name="raw.linked_dossier")
    return select_with_schema(enriched, BRONZE_SCHEMA)


@transform(
    output=Output(rid("bronze.linked_dossier")),
    source_df=Input(rid("raw.linked_dossier")),
)
def compute(output, source_df):
    get_spark("UFO-V2-Bronze-LinkedDossier")
    df = source_df.dataframe()
    output.write_dataframe(_transform(df))
