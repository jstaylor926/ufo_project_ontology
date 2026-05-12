"""
UFO V2 — Parity harness.

The parity harness compares the existing V1 ``UfoEntry`` output against the
V2-derived equivalent on a held-out, deterministic sample. It exists so the
migration team can prove — quantitatively, every build — that the V2
pipeline reproduces the V1 contract before any cutover.

Inputs
------
* V1 ``UfoEntry`` — the output dataset of ``UFOEntries.py`` in the parent
  ``DataTransformationRepository`` package. Continues to be written by V1.
* V2 Bronze ``techrequest_index`` — produced by
  ``v2_bronze.bronze_techrequest_index``. This is the canonical V2 dossier
  spine. (Later, a Phase 2 Silver dataset will plug in here instead.)

Join key
--------
``dossier_internal_id`` — stable across V1 and V2 versions of TechRequest.
The numeric ``dossier_id`` is *not* stable for migrated dossiers, so it is
**not** used as the join key.

Outputs
-------
* ``parity_ufo_entry_diff`` — one row per
  ``(dossier_internal_id, field_name)`` comparison, capturing both values
  and a match classification.
* ``parity_ufo_entry_summary`` — aggregated per-field statistics: counts,
  match percentage, and a sample of mismatching internal IDs.

The harness does not modify V1 or v2_bronze in any way.
"""
