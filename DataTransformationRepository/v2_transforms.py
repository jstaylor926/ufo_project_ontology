"""
v2_transforms.py — single-file driver for every V2 output dataset.

Purpose
-------
Phase 1 of the V1 -> V2 cut-over creates a parallel family of "_V2" datasets
that live under::

    /Airbus/Skywise-North America Services Dashboard/Exposed/ObjectBackingData/V2/

This file is the **single point of edit** for the V2 dataset family:

* every V2 output path is declared once in :data:`V2_OUTPUTS`,
* every V2 input RID is declared once in :data:`V2_INPUTS`,
* every transform that writes a V2 dataset is defined below.

Building this module in Foundry generates all V2 datasets in a single
initial run. After that, scheduled re-builds keep the V2 family in sync
with the V2 Bronze sources. The V1 transforms (``UFOEntries.py``,
``ApprDoc.py``, ``MessageParsing.py``, ``UFOPath.py``, ``ICAOObjects.py``,
``NicoTest.py``) are NOT modified — they continue to produce the V1
datasets that the parity harness reads.

Re-use strategy
---------------
The V1 transforms are decorated with ``@transform`` and so cannot be
invoked directly. Their *pure helper functions* (``Transformation1``,
``schemaSetGen``, ``permReq``, ``limitation``, etc.) are plain Python and
ARE importable. Each V2 transform below imports those helpers and runs
the same orchestration the V1 driver does, but with:

  * Inputs bound to V2 Bronze RIDs (via :data:`V2_INPUTS`).
  * Outputs bound to V2 paths (via :data:`V2_OUTPUTS`).
  * The ``v2_compat`` shim still applied for defence in depth — Bronze
    already lands V1-named columns are *not* present, so the shim folds
    the V2 schema down to V1 names before the V1 helpers see it.

Operator workflow when promoting branches
-----------------------------------------
1. Update placeholder RIDs in :data:`V2_INPUTS` to the real Bronze RIDs.
   (The same logical names are mirrored in
   ``v2_bronze/_bronze_utils.py::RIDS``; keep them in sync.)
2. Confirm the path prefix in :data:`OUTPUT_BASE` matches the target
   Compass folder.
3. Build the module. Foundry creates every dataset listed in
   :data:`V2_OUTPUTS` on the first successful run.
"""

from __future__ import annotations

from typing import Mapping

from pyspark.sql import Row, SparkSession
from pyspark.sql.types import (
    ArrayType,
    BooleanType,
    DateType,
    IntegerType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)
from transforms.api import Input, Output, transform

# V2 forward-compat shim — auto-detects V1 vs V2 schema and folds (value, *_tz)
# pairs into single TimestampType columns. See ``v2_compat.py``.
from v2_compat import (
    maybe_normalize_approval,
    maybe_normalize_dossier_index,
    maybe_normalize_messages,
)

# ---------------------------------------------------------------------------
# Output path registry
# ---------------------------------------------------------------------------
#
# Every dataset this file writes lives under OUTPUT_BASE. Keep names in the
# V2_OUTPUTS dict 1:1 with the V1 dataset they parallel — that lets the
# parity harness rebind ``v2.silver.<name>`` simply by reading this dict.
OUTPUT_BASE: str = (
    "/Airbus/Skywise-North America Services Dashboard/"
    "Exposed/ObjectBackingData/V2/"
)

V2_OUTPUTS: Mapping[str, str] = {
    # name                        full Foundry path
    "UFOEntries_V2":    OUTPUT_BASE + "UFOEntries_V2",
    "MsnRts_V2":        OUTPUT_BASE + "MsnRts_V2",
    "Messages_V2":      OUTPUT_BASE + "Messages_V2",
    "ApprovalDocs_V2":  OUTPUT_BASE + "ApprovalDocs_V2",
    "UFOPath_V2":       OUTPUT_BASE + "UFOPath_V2",
    "ICAOObjects_V2":   OUTPUT_BASE + "ICAOObjects_V2",
    "NicoTest_V2":      OUTPUT_BASE + "NicoTest_V2",
}


# ---------------------------------------------------------------------------
# Input RID registry
# ---------------------------------------------------------------------------
#
# These RIDs MUST stay in sync with v2_bronze._bronze_utils.RIDS for the
# logical names that overlap. The mapping is duplicated here (rather than
# imported) so this module remains a self-contained registry — a single
# search-and-replace updates every V2 binding.
V2_INPUTS: Mapping[str, str] = {
    # V2 Bronze sources -----------------------------------------------------
    "bronze.techrequest_index": (
        "ri.foundry.main.dataset.PLACEHOLDER-bronze-techrequest-index"
    ),
    "bronze.messages_metadata": (
        "ri.foundry.main.dataset.PLACEHOLDER-bronze-messages-metadata"
    ),
    "bronze.dossier_metadata": (
        "ri.foundry.main.dataset.PLACEHOLDER-bronze-dossier-metadata"
    ),

    # Inputs without a V2 Bronze equivalent yet ------------------------------
    # The V1 RDAF/approval dataset is still consumed verbatim; the v2_compat
    # shim is a passthrough for that schema. Replace with a Bronze RID once
    # the V2 approval feed is wired up.
    "v1.rdaf_passthrough": (
        "ri.foundry.main.dataset.beacb919-5b40-4d46-b7c8-fb32b98e3676"
    ),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ufo_spark(app_name: str) -> SparkSession:
    """Spark builder matching the V1 UFO transforms' tuning."""
    return (
        SparkSession.builder.appName(app_name)
        .config("spark.driver.cores", "4")
        .config("spark.driver.memory", "10g")
        .config("spark.executor.cores", "4")
        .config("spark.executor.memory", "6g")
        .config("spark.sql.session.timeZone", "UTC")
        .getOrCreate()
    )


def _column_headers(df):
    """Return the ordered column-name list for ``df``."""
    return [field.name for field in df.schema.fields]


# ===========================================================================
# UFOEntries_V2  +  MsnRts_V2
# ===========================================================================
#
# V1 source : UFOEntries.py
# V2 input  : bronze.techrequest_index (UTC-folded, V2-named columns)
# V2 output : UFOEntries_V2  (per-dossier UFO entry rows)
#             MsnRts_V2      (per-MSN return-to-service rollup)

@transform(
    outputData=Output(V2_OUTPUTS["UFOEntries_V2"]),
    rtsData=Output(V2_OUTPUTS["MsnRts_V2"]),
    source_df=Input(V2_INPUTS["bronze.techrequest_index"]),
)
def compute_ufo_entries_v2(outputData, rtsData, source_df):
    """V2 driver for the UFOEntries / MsnRts pair.

    Mirrors ``UFOEntries.compute`` exactly: applies the shim, runs
    Transformation1 row-by-row to build the dossier entry, then
    Transformation2 to fold in the MSN-level RTS lookup. The MSN RTS
    rollup is written to MsnRts_V2.
    """
    # Imported lazily so the V1 module's @transform decorators are not
    # triggered if Foundry happens to import this module first.
    from UFOEntries import (
        Transformation1,
        Transformation2,
        schemaSetGen,
        schemaSetGen2,
        msnSeen,
    )

    spark = _ufo_spark("UFOAPP-V2")
    schema_main = schemaSetGen()
    schema_rts = schemaSetGen2()

    df = source_df.dataframe()
    df = maybe_normalize_dossier_index(df)
    rows = df.collect()  # noqa

    headers = _column_headers(df)
    inter_arr = [Transformation1(each, headers) for each in rows]

    rts_index = schema_main.names.index("MSN_RTS")
    msn_index = schema_main.names.index("MSN")
    entry_arr = [Transformation2(row, rts_index, msn_index) for row in inter_arr]

    rts_arr = [Row(msn, rts_date) for msn, rts_date in msnSeen.items()]

    outputData.write_dataframe(spark.createDataFrame(entry_arr, schema_main))
    rtsData.write_dataframe(spark.createDataFrame(rts_arr, schema_rts))


# ===========================================================================
# Messages_V2
# ===========================================================================
#
# V1 source : MessageParsing.py
# V2 input  : bronze.messages_metadata
# V2 output : Messages_V2

@transform(
    outputData=Output(V2_OUTPUTS["Messages_V2"]),
    source_df=Input(V2_INPUTS["bronze.messages_metadata"]),
)
def compute_messages_v2(outputData, source_df):
    """V2 driver for the parsed Message dataset."""
    from MessageParsing import Transformation1 as MessageTransformation1
    from MessageParsing import schemaSetGen as message_schema

    spark = SparkSession.builder.appName("UFOMessages-V2").getOrCreate()
    schema = message_schema()

    df = source_df.dataframe()
    df = maybe_normalize_messages(df)
    df = df.select(
        "id_dossier",
        "id_message",
        "messageCreationDate",
        "messageFrom_companyName",
        "messageTo_companyName",
        "messageFrom_partnerType",
        "messageStatus",
        "operatorICAOCode",
        "CustomerMessageToSBC",
        "CustomerMessageToSBC",
        "ToSBCAW",
        "FromSBCAW",
        "messageTitle",
        "messageSubmitDate",
        "is_messageAcknowledge",
    )
    rows = df.collect()  # noqa
    headers = _column_headers(df)

    seen = set()
    entry_arr = []
    for each in rows:
        if each[1] in seen:
            continue
        seen.add(each[1])
        row = MessageTransformation1(each, headers)
        if row is not None:
            entry_arr.append(row)

    outputData.write_dataframe(spark.createDataFrame(entry_arr, schema))


# ===========================================================================
# ApprovalDocs_V2
# ===========================================================================
#
# V1 source : ApprDoc.py
# V2 inputs : bronze.messages_metadata + V1 RDAF passthrough
#             (replace ``v1.rdaf_passthrough`` once the V2 approval Bronze
#             table exists)
# V2 output : ApprovalDocs_V2

@transform(
    outputData=Output(V2_OUTPUTS["ApprovalDocs_V2"]),
    rdaf=Input(V2_INPUTS["v1.rdaf_passthrough"]),
    message=Input(V2_INPUTS["bronze.messages_metadata"]),
)
def compute_approval_docs_v2(message, rdaf, outputData):
    """V2 driver for the ApprovalDocs dataset."""
    from ApprDoc import (
        transformationRDAF,
        transformationMessage,
        schemaSetGen as approval_schema,
        dossSeenMessages,
    )

    spark = SparkSession.builder.appName("UFOApprovalDocs-V2").getOrCreate()
    schema = approval_schema()

    rdaf_df = maybe_normalize_approval(rdaf.dataframe())
    message_df = maybe_normalize_messages(message.dataframe())

    rdaf_df = rdaf_df.select(
        "approvalDocStatus",
        "total_flight_cycles",
        "total_flight_hours",
        "component_flight_hours",
        "component_flight_cycles",
        "target_date",
        "end_target_date",
        "id_dossier",
        "approvalDoc_id",
        "approvalDocType",
        "approvalDocCategory",
        "limitation_type",
        "approvalDocIssue",
        "approval_date",
        "rdaf_type",
        "assigned_date",
    )
    message_df = message_df.select(
        "messageStatus",
        "id_dossier",
        "id_message",
        "messageAttachmentName",
        "messageSubmitDate",
    )

    rdaf_rows = rdaf_df.collect()
    message_rows = message_df.collect()
    rdaf_headers = _column_headers(rdaf_df)
    message_headers = _column_headers(message_df)

    entry_arr = []
    for each in rdaf_rows:
        row = transformationRDAF(each, rdaf_headers)
        if row is not None:
            entry_arr.append(row)
    for each in message_rows:
        transformationMessage(each, message_headers)
    for each in dossSeenMessages.values():
        entry_arr.append(each)

    outputData.write_dataframe(spark.createDataFrame(entry_arr, schema))


# ===========================================================================
# UFOPath_V2
# ===========================================================================
#
# V1 source : UFOPath.py
# V2 inputs : Messages_V2 + ApprovalDocs_V2 (this file's own outputs)
# V2 output : UFOPath_V2

@transform(
    outputData=Output(V2_OUTPUTS["UFOPath_V2"]),
    messages=Input(V2_OUTPUTS["Messages_V2"]),
    appr=Input(V2_OUTPUTS["ApprovalDocs_V2"]),
)
def compute_ufo_path_v2(outputData, appr, messages):
    """V2 driver for the UFOPath rollup."""
    from UFOPath import (
        permReqTransformation,
        rdafTransformation,
        instrTransformation,
        finalTrans,
        schemaSetGen as path_schema,
        dossSeenMessages,
        dossSeenRDAFs,
        dossSeenInstr,
    )

    spark = SparkSession.builder.appName("UFOPath-V2").getOrCreate()
    schema = path_schema()

    messages_df = messages.dataframe()
    messages_df = messages_df.filter(messages_df.PermanentRequest == True)  # noqa: E712
    messages_df = messages_df.select("DossierID", "MessageCreationDate")
    message_rows = messages_df.collect()

    rdaf_df = appr.dataframe()
    rdaf_df = rdaf_df.filter(
        (rdaf_df.DocType == "RDAF") & (rdaf_df.Status == "SENT")
    )
    rdaf_df = rdaf_df.select("Dossier_ID", "startDate")
    rdaf_rows = rdaf_df.collect()

    instr_df = appr.dataframe()
    instr_df = instr_df.filter(instr_df.DocType != "RDAF")
    instr_df = instr_df.select("Dossier_ID", "startDate")
    instr_rows = instr_df.collect()

    for each in message_rows:
        permReqTransformation(each)
    for each in rdaf_rows:
        rdafTransformation(each)
    for each in instr_rows:
        instrTransformation(each)

    entry_arr = []
    for each in list(dossSeenRDAFs.keys()):
        vals = finalTrans(each)
        entry_arr.append(Row(*vals))
    for each in list(dossSeenMessages.keys()):
        if each not in dossSeenInstr:
            vals = [each, "RDAF Not Delivered", "Instruction Not Delivered"]
        else:
            permReqDate = dossSeenMessages[each].date()
            instrDate = dossSeenInstr[each]
            del dossSeenInstr[each]
            instrVal = (
                "Instruction Not Delivered"
                if permReqDate > instrDate
                else "Instruction Delivered"
            )
            vals = [each, "RDAF Not Delivered", instrVal]
        entry_arr.append(Row(*vals))
    for each in list(dossSeenInstr.keys()):
        entry_arr.append(Row(each, "RDAF Not Delivered", "Instruction Delivered"))

    outputData.write_dataframe(spark.createDataFrame(entry_arr, schema))


# ===========================================================================
# ICAOObjects_V2
# ===========================================================================
#
# V1 source : ICAOObjects.py
# V2 input  : UFOEntries_V2 (this file's own output)
# V2 output : ICAOObjects_V2

@transform(
    outputData=Output(V2_OUTPUTS["ICAOObjects_V2"]),
    source_df=Input(V2_OUTPUTS["UFOEntries_V2"]),
)
def compute_icao_objects_v2(outputData, source_df):
    """V2 driver for the ICAO template dataset."""
    from ICAOObjects import schemaSetGen as icao_schema

    spark = _ufo_spark("ICAOObjects-V2")
    schema = icao_schema()

    df = source_df.dataframe()
    icaos = df.select("operator_ICAO", "Status", "Priority").collect()

    seen = {}
    for row in icaos:
        if row[0] not in seen:
            seen[row[0]] = [0, 0, 0, 0, 0]
    if None in seen:
        seen["NullVal"] = seen.pop(None)

    rows_out = []
    for icao_code, counters in seen.items():
        vals = [icao_code, *counters, False, False]
        rows_out.append(Row(*vals))

    outputData.write_dataframe(spark.createDataFrame(rows_out, schema))


# ===========================================================================
# NicoTest_V2
# ===========================================================================
#
# V1 source : NicoTest.py
# V2 input  : bronze.techrequest_index
# V2 output : NicoTest_V2
#
# Kept for parity with the V1 codebase; mark as deprecated and drop after
# the V2 cut-over if no longer needed.

@transform(
    outputData=Output(V2_OUTPUTS["NicoTest_V2"]),
    source_df=Input(V2_INPUTS["bronze.techrequest_index"]),
)
def compute_nico_test_v2(outputData, source_df):
    """V2 driver for the NicoTest ICAO-count debug dataset."""
    spark = _ufo_spark("NicoTest-V2")

    df = source_df.dataframe()
    df = maybe_normalize_dossier_index(df)
    df = df.select("operatorICAOCode")

    icao_seen = {}
    for row in df.collect():
        key = "None" if row[0] is None else row[0]
        icao_seen[key] = icao_seen.get(key, 0) + 1

    schema = StructType([
        StructField("ICAO_code", StringType(), False),
        StructField("A320Count", IntegerType(), False),
    ])
    entry_arr = [Row(k, v) for k, v in icao_seen.items()]
    outputData.write_dataframe(spark.createDataFrame(entry_arr, schema))


# ---------------------------------------------------------------------------
# Sanity export
# ---------------------------------------------------------------------------
#
# Public surface so callers (tests, the parity harness, ops scripts) can
# enumerate the V2 dataset family without importing private symbols.
__all__ = [
    "OUTPUT_BASE",
    "V2_OUTPUTS",
    "V2_INPUTS",
    "compute_ufo_entries_v2",
    "compute_messages_v2",
    "compute_approval_docs_v2",
    "compute_ufo_path_v2",
    "compute_icao_objects_v2",
    "compute_nico_test_v2",
]
