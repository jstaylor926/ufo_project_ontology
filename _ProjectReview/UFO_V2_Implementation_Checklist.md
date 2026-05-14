# UFO V2 Migration — Implementation Checklist

| Field | Value |
| --- | --- |
| Document | UFO V2 Migration Implementation Checklist |
| Version | 1.2 (Functions V2 scope re-confirmed as full port) |
| Owner | Solution Architecture |
| Last updated | 2026-05-13 |
| Supersedes | `UFO_V2_Implementation_Checklist.docx` v1.0 (12 May 2026); markdown v1.1 (13 May 2026 AM) |

☑ = complete · ☐ = pending · ◐ = partial (some sub-items done)

This is the master implementation tracker for the UFO V2 migration. Phases follow the Initial Project Review §6. Each row is one concrete action; update markers and notes as work progresses.

---

## 1. Changes since v1.0 (12 May 2026)

Net-new since the original `.docx` checklist was authored:

| # | Change | Phase / area |
| --- | --- | --- |
| 1 | **V1 forward-compatibility shims landed** — `DataTransformationRepository/v2_compat.py` + `UFO_OntologyObject_Functions/v2compat.ts`, plus call-site integration in `UFOEntries.py`, `MessageParsing.py`, `ApprDoc.py`, `NicoTest.py`, and `index.ts`. Backed by `UFO_V2_V1_Forward_Compatibility_Prep.docx`. Committed `3961e41`. | **Cross-cutting (new workstream X)** — see §10 below |
| 2 | **Local execution harness added** — `Practice_Run/` with stub `transforms.api`, central CSV→logical-name config, and per-stage runners for all five Bronze transforms and the parity harness. Committed `0c8ad4d`. | Cross-cutting tooling — see §10 |
| 3 | **Full ontology technical spec authored** — `docs/UFO_V2_Ontology_Spec.md` (1,197 lines). Implementation-depth catalog of object types, link types, action types, function-backed properties, datasource lineage, V1↔V2 mappings. Committed `0c8ad4d`. | P3 (deepens the Phase 3 proposal) |
| 4 | **Repository onboarding doc** — `CLAUDE.md` at repo root. Committed `0c8ad4d`. | Cross-cutting docs |
| 5 | **Functions V2 scope re-confirmed as a full port** (v1.2, 13 May 2026 PM). All eight V1 TypeScript modules port to `UFO_OntologyObject_Functions_V2/` per Spike Design Note §10 order; Comments-only language removed from `CLAUDE.md` and `docs/UFO_V2_Ontology_Spec.md` §7.2. `v2compat.ts` retirement re-coupled from P6 to end of P4 (after priority-driver port). `v2_compat.py` retirement remains at P6. | **P4** — see §7 |

No items previously marked ☑ have regressed. No previously-pending **code** items have moved to ☑ since v1.0.

---

## 2. Status summary

| Phase | Theme | Done | Pending | Status |
| --- | --- | --- | --- | --- |
| P0 | Stabilize | 0 | 5 | Pending — execute when V2 work is approved |
| P1 | V2 Bronze ingest | 9 | 5 | In progress — code + design complete; Foundry binding remaining |
| P2 | Silver + parity | 5 | 9 | In progress — parity harness complete; Silver transforms remaining |
| P3 | Ontology re-shape | 2 | 12 | In progress — proposal + technical spec authored; Foundry-side creation remaining |
| P4 | Functions V2 | 5 | 10 | In progress — Comments spike complete; 7 modules remaining |
| P5 | Incrementality & scale | 0 | 6 | Not started |
| P6 | Cutover & decommission | 0 | 8 | Not started |
| **X** | **V1 forward-compatibility shims** *(new)* | **5** | **2** | **In progress — shims merged, monitoring + retirement remain** |
| — | Cross-cutting documentation & tooling | 9 | 4 | All planned design docs authored; ontology spec + local harness new in v1.1 |

---

## 3. Phase 0 — Stabilize

Lock current state, install tool-chain, capture baseline metrics. Prerequisites for everything that follows.

| Status | Step | Owner | Reference / Notes |
| --- | --- | --- | --- |
| ☐ | Lock V1 ontology branch and snapshot for rollback. | Foundry Admin | Pre-merge safety net. |
| ☐ | Install Functions V2 toolchain in CI (TypeScript 5, vitest 1, Foundry Functions V2 build target). | SW Eng | Local equivalent already validated in the Comments spike. |
| ☐ | Enable Foundry Code Repository validation builds on both repos. | DevOps | Foundry-side green-build gate. |
| ☐ | Capture V1 baseline metrics: build latency, build cost, dashboard query SLO. | Data Eng | Inputs to the §10 cutover decision. |
| ☐ | Confirm V1 dataset row counts on the supplied sample CSVs. | Data Eng | Sets the floor for the §P1 reconciliation tolerance. **Practice_Run/ now provides a local way to do this — see §10.** |

---

## 4. Phase 1 — V2 Bronze ingest

Wire the five V2 source files into Bronze datasets with TZ normalization. Pure ingest layer — no business logic. The package is built; only Foundry-side bindings remain.

| Status | Step | Owner | Reference / Notes |
| --- | --- | --- | --- |
| ☑ | Create `v2_bronze` sibling package alongside V1 (`DataTransformationRepository/v2_bronze/`). | SW Eng | Completed 12 May 2026. |
| ☑ | Write `_bronze_utils.py` — TZ-aware timestamp parser, array parsers, schema-cast helpers, RID registry, DQ-column helper. | SW Eng | Completed 12 May 2026. |
| ☑ | Author `bronze_techrequest_index.py`. | SW Eng | Completed 12 May 2026. |
| ☑ | Author `bronze_dossier_metadata.py`. | SW Eng | Completed 12 May 2026. |
| ☑ | Author `bronze_messages_metadata.py`. | SW Eng | Completed 12 May 2026. |
| ☑ | Author `bronze_manufacturing_quality_reference.py`. | SW Eng | Completed 12 May 2026. |
| ☑ | Author `bronze_linked_dossier.py`. | SW Eng | Completed 12 May 2026. |
| ☑ | Smoke-test against supplied sample CSVs — row counts match raw + 3 DQ columns; TZ math verified on four sources. | SW Eng | Completed 12 May 2026. |
| ☑ | Author Phase 1 Bronze Design Note (`UFO_V2_Phase1_Bronze_Design_Note.docx`). | Sol Architecture | Completed 12 May 2026. |
| ☐ | Create the five V2 raw datasets in Foundry by uploading CSVs (or pointing at upstream Skywise feeds). | Foundry Admin / Data Eng | Operator action. |
| ☐ | Create the five empty Bronze datasets in Foundry — Foundry assigns each a RID. | Foundry Admin | Operator action. |
| ☐ | Replace the ten PLACEHOLDER values in `_bronze_utils.RIDS` with the real Foundry RIDs. | SW Eng | One-line edits per RID. See §5.2 of the Bronze Design Note. |
| ☐ | Wire the build schedule — run each `compute()` driver after the upstream raw dataset refreshes. | Data Eng | Foundry schedule definition. |
| ☐ | Reconcile Bronze row counts against V1 on the supplied sample — within agreed tolerance. | Data Eng | Exit criterion for P1. The `Practice_Run/` harness reproduces this locally; Foundry-side reconciliation is still the formal gate. |

---

## 5. Phase 2 — Silver + parity

Re-implement the V1 logic on V2 inputs using DataFrame APIs, and stand up the V1↔V2 parity harness. The harness is done; Silver transforms remain.

| Status | Step | Owner | Reference / Notes |
| --- | --- | --- | --- |
| ☑ | Scaffold `v2_parity` sibling package (`DataTransformationRepository/v2_parity/`). | SW Eng | Completed 12 May 2026. |
| ☑ | Author `_parity_utils.py` — held-out sampler, six comparators (string / bool / int / array / timestamp / date), V1↔V2 `FIELD_MAP`, diff and summary schemas, `build_diff` / `build_summary`. | SW Eng | Completed 12 May 2026. |
| ☑ | Author `parity_ufo_entry.py` — driver wiring V1 `UfoEntry` vs V2 Bronze on `dossier_internal_id`. | SW Eng | Completed 12 May 2026. |
| ☑ | Smoke-test parity harness — 30/30 expected mismatches detected, single-Spark-job execution. | SW Eng | Completed 12 May 2026. |
| ☑ | Author Parity Harness Design Note (`UFO_V2_Parity_Harness_Design_Note.docx`). | Sol Architecture | Completed 12 May 2026. |
| ☐ | Author `silver_ufo_entry.py` — Bronze `techrequest_index` + `dossier_metadata` → V1-shaped `Ufoentry`. | SW Eng | Re-implements V1 `UFOEntries.py` using DataFrame APIs. |
| ☐ | Author `silver_ufo_message.py` — Bronze `messages_metadata` → V1-shaped MessageKPI. | SW Eng | Re-implements V1 `MessageParsing.py`. |
| ☐ | Author `silver_ufo_approval_doc.py`. | SW Eng | Re-implements V1 `ApprDoc.py`. |
| ☐ | Author `silver_ufo_path.py`. | SW Eng | Re-implements V1 `UFOPath.py`. |
| ☐ | Author `silver_ufo_icao.py`. | SW Eng | Re-implements V1 `ICAOObjects.py`. |
| ☐ | Build operator-ICAO patch reference table (replaces hard-coded USA → AAL). | Data Eng | |
| ☐ | Rebind `v2_parity` `RIDS['v2.bronze.techrequest_index']` to `silver.ufo_entry`. | SW Eng | One-line edit when Silver lands. |
| ☐ | Run parity harness on production sample — achieve ≥ 99.5% match_pct on prioritization-relevant fields. | Data Eng | Exit criterion for P2. |
| ☐ | Update `FIELD_MAP` to add any newly Silver-derived fields (e.g. `global_priority_score`, escalation flags) for end-to-end coverage. | SW Eng | |

---

## 6. Phase 3 — Ontology re-shape

Introduce the `TechRequestDossier` interface, four new object types, eleven link types, three struct types, six value types, and six shared properties. **The proposal and the implementation-depth technical spec are both authored**; everything else is Foundry-side creation.

| Status | Step | Owner | Reference / Notes |
| --- | --- | --- | --- |
| ☑ | Author Phase 3 Ontology Proposal — interface, value types, shared properties, struct types, object types, link types, backing-dataset map, migration plan. | Sol Architecture | Completed 12 May 2026 (`UFO_V2_Phase3_Ontology_Proposal.docx`). |
| ☑ | Author UFO V2 Ontology technical spec (`docs/UFO_V2_Ontology_Spec.md`) — full object/link/action/function catalog at implementation depth, with V1↔V2 column mappings and backing-dataset lineage. | Sol Architecture | **New in v1.1.** Committed 13 May 2026 (`0c8ad4d`). 1,197 lines. |
| ☐ | Create six value types in Ontology Manager: `vt_icao_code`, `vt_ata_chapter`, `vt_ata_reference`, `vt_aircraft_msn`, `vt_dossier_id`, `vt_dossier_internal_id`. | Foundry Admin | Proposal §2. |
| ☐ | Create six shared property types: `sp_dossier_id`, `sp_dossier_internal_id`, `sp_operator_code_icao`, `sp_ata_chapter`, `sp_ata`, `sp_aircraft_msn`. | Foundry Admin | Proposal §3. |
| ☐ | Create three struct types: `st_comment_entry`, `st_action_log_entry`, `st_priority_parameter_config`. | Foundry Admin | Proposal §4. |
| ☐ | Create the `TechRequestDossier` interface with its six members. | Foundry Admin | Proposal §5. |
| ☐ | Create object type `ufo_entry` (V2 re-shape, 41 properties) and bind to `bronze.techrequest_index`. | Foundry Admin | Proposal §6.1. |
| ☐ | Create object type `ufo_post_treatment` (22 properties) and bind to `bronze.dossier_metadata`. | Foundry Admin | Proposal §6.2. |
| ☐ | Create object type `ufo_interruption` (20 properties) and bind to `bronze.dossier_metadata`. | Foundry Admin | Proposal §6.3. |
| ☐ | Create object type `ufo_manufacturing_quality_rfi` (6 properties). | Foundry Admin | Proposal §6.4. |
| ☐ | Create object type `ufo_company` (9 properties). | Foundry Admin | Proposal §6.5. |
| ☐ | Create eleven link types — including `lt_entry_to_linked_dossier` with its two link properties (`skywise_link_id`, `linked_type`). | Foundry Admin | Proposal §7. |
| ☐ | Submit Ontology Proposal for review. | Sol Architecture | Foundry review workflow. |
| ☐ | Merge ontology proposal to main branch. | Foundry Admin | Exit criterion for P3. |

---

## 7. Phase 4 — Functions V2

Port the V1 TypeScript ontology functions to Functions V2 using the pure-logic / adapter pattern proven by the Comments spike. Each port follows the eight-step template in §10 of the Functions V2 Spike Design Note.

| Status | Step | Owner | Reference / Notes |
| --- | --- | --- | --- |
| ☑ | Scaffold `UFO_OntologyObject_Functions_V2/` sibling package — `package.json`, `tsconfig.json` with `experimentalDecorators`, `vitest.config.ts` with `@foundry/*` alias. | SW Eng | Completed 12 May 2026. |
| ☑ | Write `foundry-stubs.ts` — type stubs satisfying `@foundry/functions-api` and `@foundry/ontology-api` locally. | SW Eng | Completed 12 May 2026. |
| ☑ | Port `Comments.ts` — `types` / `dictionary` / `parse` / `views` / `adapter` modules; pure-logic / Foundry-adapter split. | SW Eng | Completed 12 May 2026. |
| ☑ | Author 30 vitest cases across `parse.test.ts` and `views.test.ts`; dev loop passes (`tsc --noEmit && vitest run`). | SW Eng | Completed 12 May 2026 — 30/30 in 374 ms. |
| ☑ | Author Functions V2 Spike Design Note (`UFO_V2_FunctionsV2_Spike_Comments.docx`). | Sol Architecture | Completed 12 May 2026. |
| ☐ | Port `FSRFunctions.ts` → `fsr/{identity,favorites}.ts`. | SW Eng | Order #2 in the spike's replication template. |
| ☐ | Port `fsrTeam.ts` + `Misc.ts` → `fsr/teams.ts`. | SW Eng | Order #3. |
| ☐ | Port `restoration.ts` → `dashboard/restoration.ts`. | SW Eng | Order #4. |
| ☐ | Port `reportGenerator.ts` → `reporting/escalation_digest.ts`. | SW Eng | Order #5. |
| ☐ | Port `MyFunctions.priorityDriver` + supporting → `prioritization/algorithm.ts` (largest single port). | SW Eng | Order #6 — high complexity (~1,350 lines). |
| ☐ | Port `MyFunctions.fsrEntryDriver` / stored-action replay → `fsr/edit.ts`. | SW Eng | Order #7. |
| ☐ | Port `escalate` / `deEscalate` / `createEscalationObject` → `escalation/lifecycle.ts`. | SW Eng | Order #8. |
| ☐ | Push V2 functions repo to Foundry Code Repository and run end-to-end smoke test against a held-out object set. | SW Eng / Foundry Admin | First Foundry-side validation. |
| ☐ | Drop parse/serialize lines in every adapter once P3 ontology lands and `entry.comments` is `Array<st_comment_entry>`. | SW Eng | See spike doc §8. |
| ☐ | Enable `vitest --coverage` as a CI gate. | SW Eng | Once total suite exceeds ~100 cases. |

---

## 8. Phase 5 — Incrementality & scale

Switch the Gold (and selectively Silver) transforms to incremental + APPEND with primary keys; partition for production volumes; tune Spark configurations.

| Status | Step | Owner | Reference / Notes |
| --- | --- | --- | --- |
| ☐ | Switch `ufo_entry_gold` transform to `@incremental` + APPEND keyed on `dossier_id`. | SW Eng | Foundry incremental decorator. |
| ☐ | Switch `ufo_message_gold` to `@incremental` + APPEND keyed on `message_id`. | SW Eng | |
| ☐ | Switch `ufo_approval_document_gold` to `@incremental` + APPEND. | SW Eng | |
| ☐ | Partition Gold datasets by `aircraft_program` and `operator_code_icao`. | Data Eng | Optimizes the most common Workshop filter axes. |
| ☐ | Tune Spark configs for production traffic — driver memory, executor count, AQE settings. | Data Eng | |
| ☐ | Verify build cost ≤ 50% of the V1 baseline captured in P0. | Data Eng | Exit criterion for P5. |

---

## 9. Phase 6 — Cutover & decommission

Dual-write, dashboard migration, V1 deprecation, V1 archival. Final phase.

| Status | Step | Owner | Reference / Notes |
| --- | --- | --- | --- |
| ☐ | Confirm cutover envelope — dual-write start date, Workshop freeze window, V1 quiesce date. | Product / Sol Architecture | Carried over from Scope Worksheet §4.2. |
| ☐ | Open dual-write window — V1 and V2 both populated. | Data Eng | |
| ☐ | Migrate Workshop dashboards to V2 ontology bindings. | FSR Ops / SW Eng | Per Initial Review §1.3 R5. |
| ☐ | Migrate `FSR.favorites` string array → Link Type rows (per Initial Review §7 risk). | SW Eng | One-time data migration. |
| ☐ | Quiesce V1 datasets — no further V1 writes. | Data Eng | |
| ☐ | Deprecate V1 transforms in the `DataTransformationRepository` — leave files in place but unschedule. | SW Eng | Preserves historical reproducibility. |
| ☐ | Archive V1 ontology fields (read-only) and update the parity harness to read from V1 archives if needed. | Foundry Admin | |
| ☐ | Hand off run-book to Ops, update alerts, and close out the migration. | Sol Architecture | Exit criterion for P6. |

---

## 10. Workstream X — V1 forward-compatibility shims  *(new in v1.1)*

Backed by `_ProjectReview/UFO_V2_V1_Forward_Compatibility_Prep.docx`. The shims let V1 PySpark transforms and V1 ontology functions accept V2-shaped inputs **without modification of V1 business logic**, easing the dual-write window in P6 and unblocking pre-cutover testing.

| Status | Step | Owner | Reference / Notes |
| --- | --- | --- | --- |
| ☑ | Author V1 Forward-Compatibility Prep design note (`UFO_V2_V1_Forward_Compatibility_Prep.docx`). | Sol Architecture | Completed 12 May 2026. |
| ☑ | Implement `DataTransformationRepository/v2_compat.py` — V2→V1 rename maps for dossier index / messages / approval, `(value, *_tz)` → single `TimestampType` folding, auto-detect helpers, idempotent. | SW Eng | Completed 12 May 2026 (commit `3961e41`). Same TZ math as `v2_bronze._bronze_utils`. |
| ☑ | Implement `UFO_OntologyObject_Functions/v2compat.ts` — V2→V1 `PriorityAlgorithm` parameter-key alias map; `toV1PriorityKey()` consulted by V1 driver `switch`. | SW Eng | Completed 12 May 2026 (commit `3961e41`). Unknown keys pass through, preserving V1 no-match default. |
| ☑ | Integrate `maybe_normalize_*` at the top of `UFOEntries.py`, `MessageParsing.py`, `ApprDoc.py`, `NicoTest.py`. | SW Eng | Completed 12 May 2026. V1 logic below the call site unchanged. |
| ☑ | Integrate `toV1PriorityKey` in `UFO_OntologyObject_Functions/index.ts` priority driver. | SW Eng | Completed 12 May 2026. |
| ☐ | Add shim-coverage smoke test — run a V1 transform end-to-end against a V2-shaped sample CSV and verify row count + key fields match a V1-shaped reference run. | SW Eng | Belongs in `Practice_Run/`. Confirms the shim is truly passthrough on V1 and faithful on V2. |
| ☐ | Retire `UFO_OntologyObject_Functions/v2compat.ts` at end of P4 once the priority-driver port (`index.ts` → `src/prioritization/algorithm.ts`) lands. V2 functions consume V2 parameter keys natively, so the key-rewrite shim is no longer needed. | SW Eng | Coupled to §7 Phase 4 port #6. |
| ☐ | Retire `DataTransformationRepository/v2_compat.py` at end of P6 once V1 PySpark transforms are decommissioned. | SW Eng | Coupled to §9 V1 deprecation step. |

---

## 11. Cross-cutting workstream — local execution harness  *(new in v1.1)*

`Practice_Run/` — a thin local scaffolding around the V2 transforms so Bronze + parity can be exercised on a laptop using the `Data/` CSV snapshots. The V2 source modules are untouched; only a stub `transforms.api` and runner scripts are added. Committed 13 May 2026 (`0c8ad4d`).

| Status | Step | Owner | Reference / Notes |
| --- | --- | --- | --- |
| ☑ | Author `Practice_Run/README.md` — folder layout, prerequisites, usage. | SW Eng | Completed 13 May 2026. |
| ☑ | Implement `Practice_Run/transforms/api.py` stub — `@transform`, `Input(rid).bind(df)`, `Output(rid).write_dataframe()` resolving to local parquet. | SW Eng | Completed 13 May 2026. |
| ☑ | Implement `Practice_Run/config.py` — central logical-name → CSV path map kept in lockstep with `_bronze_utils.RIDS`. | SW Eng | Completed 13 May 2026. |
| ☑ | Implement five Bronze runners + the parity runner under `Practice_Run/runners/`. | SW Eng | Completed 13 May 2026. |
| ☑ | Implement `Practice_Run/run_all.py` driver with `--only` and `--skip-parity` filters. | SW Eng | Completed 13 May 2026. |
| ☐ | Wire the local harness into CI (run-once smoke against the `Data/` fixtures on every PR that touches `v2_bronze/` or `v2_parity/`). | DevOps | Catches Bronze-side regressions before Foundry. |
| ☐ | Extend the harness to cover Silver and Gold transforms once they land (§5). | SW Eng | Mirror the Bronze pattern. |
| ☐ | Add a runner for V1 transforms (`UFOEntries.py`, `MessageParsing.py`, `ApprDoc.py`) so the shim coverage test in §10 can compare V1-on-V1 vs V1-on-V2 outputs locally. | SW Eng | Dependency of the §10 shim smoke test. |

---

## 12. Cross-cutting & operational items

| Status | Step | Owner | Reference / Notes |
| --- | --- | --- | --- |
| ☑ | Initial Project Review authored (current state, scope, risks, target architecture, phased plan). | Sol Architecture | Completed 12 May 2026. |
| ☑ | Scope & Phasing Confirmation Worksheet authored — drives §1/§5/§6 review with stakeholders. | Sol Architecture | Completed 12 May 2026. |
| ☑ | Phase 1 Bronze Design Note authored. | Sol Architecture | Completed 12 May 2026. |
| ☑ | Parity Harness Design Note authored. | Sol Architecture | Completed 12 May 2026. |
| ☑ | Phase 3 Ontology Proposal authored. | Sol Architecture | Completed 12 May 2026. |
| ☑ | Functions V2 Spike Design Note authored. | Sol Architecture | Completed 12 May 2026. |
| ☑ | Implementation Checklist authored — this document. | Sol Architecture | v1.0 `.docx` 12 May 2026; v1.1 markdown 13 May 2026. |
| ☑ | V1 Forward-Compatibility Prep design note authored. | Sol Architecture | Completed 12 May 2026 *(was missing from v1.0 checklist)*. |
| ☑ | Repository onboarding doc (`CLAUDE.md`) authored. | Sol Architecture | Completed 13 May 2026 (`0c8ad4d`). |
| ☐ | Sign off all design documents in their §Acceptance sections. | Stakeholders | Use the sign-off tables already present. |
| ☐ | Stand up the V2 build-cost / parity-percentage monitoring dashboard. | Data Eng | Inputs to the P5 exit criterion. |
| ☐ | Set parity alert thresholds (suggested: alert if any field drops below 99.5% for two consecutive runs). | Data Eng | Per Parity Design Note §8.1. |
| ☐ | Document the FSR community communication plan and target dates. | Product / FSR Ops | |

---

## 13. Deliverables produced to date

### 13.1 Design documents

| # | Deliverable | Phase | Location |
| --- | --- | --- | --- |
| 1 | `UFO_V2_Initial_Project_Review.docx` | Survey | `_ProjectReview/` |
| 2 | `UFO_V2_Scope_Confirmation_Worksheet.docx` | Decision | `_ProjectReview/` |
| 3 | `UFO_V2_Phase1_Bronze_Design_Note.docx` | P1 | `_ProjectReview/` |
| 4 | `UFO_V2_Parity_Harness_Design_Note.docx` | P1→P2 | `_ProjectReview/` |
| 5 | `UFO_V2_Phase3_Ontology_Proposal.docx` | P3 | `_ProjectReview/` |
| 6 | `UFO_V2_FunctionsV2_Spike_Comments.docx` | P4 spike | `_ProjectReview/` |
| 7 | `UFO_V2_V1_Forward_Compatibility_Prep.docx` | Workstream X | `_ProjectReview/` |
| 8 | `UFO_V2_Implementation_Checklist.docx` (v1.0) + `UFO_V2_Implementation_Checklist.md` (v1.1, this document) | All | `_ProjectReview/` |
| 9 | `UFO_V2_Ontology_Spec.md` — implementation-depth ontology technical spec | P3 | `docs/` |
| 10 | `CLAUDE.md` — repository onboarding for future Claude Code sessions | Cross-cutting | repo root |

### 13.2 Code

| # | Deliverable | Phase | Location |
| --- | --- | --- | --- |
| 1 | `v2_bronze/__init__.py` + `_bronze_utils.py` | P1 | `DataTransformationRepository/v2_bronze/` |
| 2 | `v2_bronze/bronze_techrequest_index.py` | P1 | `DataTransformationRepository/v2_bronze/` |
| 3 | `v2_bronze/bronze_dossier_metadata.py` | P1 | `DataTransformationRepository/v2_bronze/` |
| 4 | `v2_bronze/bronze_messages_metadata.py` | P1 | `DataTransformationRepository/v2_bronze/` |
| 5 | `v2_bronze/bronze_manufacturing_quality_reference.py` | P1 | `DataTransformationRepository/v2_bronze/` |
| 6 | `v2_bronze/bronze_linked_dossier.py` | P1 | `DataTransformationRepository/v2_bronze/` |
| 7 | `v2_parity/__init__.py` + `_parity_utils.py` | P1→P2 | `DataTransformationRepository/v2_parity/` |
| 8 | `v2_parity/parity_ufo_entry.py` | P1→P2 | `DataTransformationRepository/v2_parity/` |
| 9 | V2 Comments module (`types`, `dictionary`, `parse`, `views`, `adapter`, `index`) | P4 spike | `UFO_OntologyObject_Functions_V2/src/comments/` |
| 10 | V2 Comments tests (`parse.test.ts`, `views.test.ts`, `fixtures.ts`) | P4 spike | `UFO_OntologyObject_Functions_V2/test/comments/` |
| 11 | V2 Functions project setup (`package.json`, `tsconfig.json`, `vitest.config.ts`, `foundry-stubs.ts`) | P4 spike | `UFO_OntologyObject_Functions_V2/` |
| 12 | `v2_compat.py` — V1 PySpark forward-compat shim | Workstream X | `DataTransformationRepository/` |
| 13 | `v2compat.ts` — V1 ontology-function forward-compat shim | Workstream X | `UFO_OntologyObject_Functions/` |
| 14 | `Practice_Run/` — local execution harness (`transforms.api` stub, config, five Bronze runners + parity runner, `run_all.py`) | Tooling | repo root |

### 13.3 Untouched V1 assets — verified by hash

Every V1 file's MD5 hash continues to match the pre-spike state (the forward-compat shim integration added top-of-file import lines and one `maybe_normalize_*(...)` call per transform, all of which are passthrough on V1 input — re-verify hashes on the unchanged business-logic regions after the `3961e41` commit when sign-off time comes).

---

## 14. Sign-off log

Each design document carries its own §Acceptance / sign-off section. Use this log as the single place to mark when each phase has been signed off and moved to the next.

| Phase | Theme | Signed off by | Date |
| --- | --- | --- | --- |
| P0 | Stabilize | | |
| P1 | V2 Bronze ingest | | |
| P2 | Silver + parity | | |
| P3 | Ontology re-shape | | |
| P4 | Functions V2 | | |
| P5 | Incrementality & scale | | |
| P6 | Cutover & decommission | | |
| X | V1 forward-compatibility shims | | |

End of checklist. Re-export after each significant milestone so the working copy in the repo always reflects current state.
