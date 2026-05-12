"""
UFO V2 — Bronze layer.

This package wires the five TechRequest V2 source files into Bronze datasets.

Layer contract:
    * Raw ingest only — no business logic.
    * Strict, typed schema applied at write time.
    * Every timezone-aware timestamp (value + *_tz pair) is normalized to a
      single UTC ``TimestampType`` column. The companion ``*_tz`` column is
      preserved for downstream display use.
    * Three data-quality columns are appended to every Bronze table:
      ``_ingested_at`` (UTC TimestampType), ``_source_dataset`` (StringType),
      and ``_row_uid`` (StringType, deterministic per source row).

The V1 transforms in the parent package remain in place and untouched.
"""
