"""
Central config for the Practice_Run local harness.

All paths resolve relative to the repo root (the parent of this Practice_Run
folder) so the scripts work from any working directory.

Two things live here:

1. ``DATASETS`` — a logical-name → CSV-path map. Mirrors the keys used in
   ``DataTransformationRepository/v2_bronze/_bronze_utils.py::RIDS`` so the
   mock ``transforms.api`` (see ``transforms/api.py``) can resolve an Input's
   RID back to a real CSV on disk.

2. ``OUTPUT_DIR`` — where the local runners write parquet results.

If your CSV filenames or locations differ, edit the DATASETS table — nothing
else in the harness needs to change.
"""

from __future__ import annotations

import os
from pathlib import Path

# Repo root = parent of this file's parent.
REPO_ROOT: Path = Path(__file__).resolve().parent.parent

DATA_DIR: Path = REPO_ROOT / "Data"
OUTPUT_DIR: Path = REPO_ROOT / "Practice_Run" / "output"

# Logical dataset name -> local CSV path.
# Keys must match the entries in v2_bronze._bronze_utils.RIDS and
# v2_parity._parity_utils.RIDS so the mock Input/Output can resolve them.
DATASETS: dict[str, Path] = {
    # ----- V2 raw inputs (CSV uploads from TechRequest V2) -----
    "raw.techrequest_index":              DATA_DIR / "techrequest_index_metadata_v2.csv",
    "raw.dossier_metadata":               DATA_DIR / "tr_dossier_metadata_filtered.csv",
    "raw.messages_metadata":              DATA_DIR / "tr_messages_metadata.csv",
    "raw.manufacturing_quality_reference":DATA_DIR / "tr_manufacturing_quality_reference.csv",
    "raw.linked_dossier":                 DATA_DIR / "tr_linked_dossier.csv",

    # ----- V1 input used by the parity harness -----
    # The parity harness reads the live V1 UfoEntry table; in Foundry it's an
    # @transform output. Locally we point it at the snapshot CSV.
    "v1.ufo_entry":                       DATA_DIR / "tr_v1.csv",

    # ----- Bronze outputs (resolved to parquet folders under OUTPUT_DIR) -----
    "bronze.techrequest_index":              OUTPUT_DIR / "bronze_techrequest_index",
    "bronze.dossier_metadata":               OUTPUT_DIR / "bronze_dossier_metadata",
    "bronze.messages_metadata":              OUTPUT_DIR / "bronze_messages_metadata",
    "bronze.manufacturing_quality_reference":OUTPUT_DIR / "bronze_manufacturing_quality_reference",
    "bronze.linked_dossier":                 OUTPUT_DIR / "bronze_linked_dossier",

    # The parity harness reads the Bronze output it just produced.
    "v2.bronze.techrequest_index":           OUTPUT_DIR / "bronze_techrequest_index",

    # ----- Parity outputs -----
    "parity.ufo_entry_diff":    OUTPUT_DIR / "parity_ufo_entry_diff",
    "parity.ufo_entry_summary": OUTPUT_DIR / "parity_ufo_entry_summary",
}


def dataset_path(logical_name: str) -> Path:
    """Resolve a logical dataset name to a local Path."""
    if logical_name not in DATASETS:
        raise KeyError(
            f"No local path registered for '{logical_name}'. "
            f"Add it to Practice_Run/config.py::DATASETS. "
            f"Known: {sorted(DATASETS)}"
        )
    return DATASETS[logical_name]


def ensure_output_dir() -> Path:
    """Create the output directory if it doesn't exist."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    return OUTPUT_DIR
