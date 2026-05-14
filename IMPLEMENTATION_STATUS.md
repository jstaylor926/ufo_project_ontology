# UFO V2 — Implementation Checklist & Current Status

**Project:** Unified Fleet Operations (UFO) — V1 → V2 TechRequest migration
**As of:** 2026-05-13
**Author:** Solution Architect / Data Engineering
**Scope:** Palantir Foundry — DataTransformation (PySpark), Ontology Functions (TypeScript V1 & V2), Ontology Manager (objects, links, actions), Workshop

---

## 1. Executive snapshot

| Workstream | Code | Tests | Foundry | Overall |
|------------|------|-------|---------|---------|
| **P0 — Stabilize V1** | n/a | n/a | ⬜ Pending | ⬜ |
| **P1 — V2 Bronze ingest** | ✅ Complete | ✅ Local smoke pass | ⬜ Pending RID wiring | 🟠 |
| **P2 — Silver + parity** | ◐ Parity only | ✅ Parity smoke pass | ⬜ | 🟠 |
| **P3 — Ontology re-shape** | n/a (spec) | n/a | ⬜ | 🟠 |
| **P4 — Functions V2 (full port)** | ◐ Comments only (1 of 8) | ✅ 130 vitest cases pass for Comments | ⬜ Deploy pending | 🟠 |
| **P5 — Incrementality & scale** | ⬜ | ⬜ | ⬜ | ⬜ |
| **P6 — Cutover & decommission** | ⬜ | ⬜ | ⬜ | ⬜ |
| **X — V1 forward-compat shims** | ✅ Complete | ◐ Manual | ✅ Integrated in V1 | 🟢 |
| **Cross-cutting — docs/tooling** | ✅ Complete | n/a | n/a | 🟢 |

**Legend:** ✅ done · ◐ partially done · ⬜ not started · 🟠 in progress · 🟢 complete

**Headline:** All migration code that *can* be written outside Foundry is written. The next major gate is Foundry-side binding (datasets, RIDs, ontology objects, deployed functions). Phases 5 and 6 are not yet started and depend on the gate above.

---

## 2. Phase 0 — Stabilize V1 (prerequisite)

Lock V1 behaviour and baselines before any V2 work can be compared against it.

- [ ] Capture V1 dataset row-count + checksum baseline for the five V1 transforms (`UFOEntries`, `MessageParsing`, `ApprDoc`, `UFOPath`, `ICAOObjects`)
- [ ] Snapshot the V1 priority algorithm output for the canonical "held-out 00-bucket" sample
- [ ] Confirm V1 toolchain reproducibility — pin Foundry stack versions for the active branch
- [ ] Tag the V1 production line in source control (`v1-final` or equivalent) so it can be diffed against the migration
- [ ] Confirm rollback procedure if Bronze build introduces upstream regressions

---

## 3. Phase 1 — V2 Bronze ingest

Raw, schema-enforced, content-preserving load of the five V2 TechRequest feeds into Foundry Bronze datasets. Every Bronze table folds each `(value, *_tz)` pair into a single UTC `TimestampType` column and carries the three DQ columns `_ingested_at`, `_source_dataset`, `_row_uid`.

### Code & local validation

- [x] Bronze utility module — `DataTransformationRepository/v2_bronze/_bronze_utils.py` (TZ folding, schema cast, DQ appender, RID registry, SparkSession UTC config)
- [x] `bronze_techrequest_index.py` — dossier spine (102 columns)
- [x] `bronze_dossier_metadata.py` — wide context (7 TZ pairs)
- [x] `bronze_messages_metadata.py` — messages (11 TZ pairs)
- [x] `bronze_manufacturing_quality_reference.py` — Skywise RFI link
- [x] `bronze_linked_dossier.py` — dossier-to-dossier links
- [x] Local Practice_Run runners for all five Bronze stages
- [x] Five V2 sample CSVs staged under `Data/`
- [x] `Practice_Run/run_all.py --skip-parity` end-to-end smoke passes
- [x] Bronze contract documented in `_ProjectReview/UFO_V2_Phase1_Bronze_Design_Note.docx`

### Foundry-side binding (next gate)

- [ ] Create five V2 raw datasets in Foundry and provision read access
- [ ] Create five empty Bronze datasets in Foundry
- [ ] Populate real RIDs into `DataTransformationRepository/v2_bronze/_bronze_utils.py::RIDS`
- [ ] Wire each `@transform` to its raw/bronze dataset pair and verify the first build
- [ ] Set up build schedules (incremental once Phase 5 lands)
- [ ] Health Checks on Bronze datasets — row count drift, null-rate per critical column, TZ-fold sanity
- [ ] Sign-off: row counts in Foundry match local Practice_Run output within tolerance

---

## 4. Phase 2 — Silver + parity

Promote Bronze into business-modeled Silver tables that re-implement the V1 transforms on V2 inputs, validated by the parity harness to ≥ 99.5% match on prioritization-relevant fields.

### Parity harness (built)

- [x] `DataTransformationRepository/v2_parity/_parity_utils.py` — 6 typed comparators + 59-field `FIELD_MAP` + held-out `00`-bucket sampler + diff/summary builders
- [x] `DataTransformationRepository/v2_parity/parity_ufo_entry.py` — V1 `UfoEntry` ↔ V2 `bronze_techrequest_index` driver, joined on `dossier_internal_id`
- [x] Emits `parity.ufo_entry_diff` (per-field, per-row) and `parity.ufo_entry_summary` (per-field match %)
- [x] Local smoke pass via `run_parity_ufo_entry.py`
- [x] Methodology recorded in `_ProjectReview/UFO_V2_Parity_Harness_Design_Note.docx`

### Silver transforms (pending)

- [ ] `silver_ufo_entry.py` — re-implement V1 `UFOEntries.py` on Bronze `techrequest_index` + `dossier_metadata`
- [ ] `silver_ufo_message.py` — re-implement V1 `MessageParsing.py` on Bronze `messages_metadata`
- [ ] `silver_ufo_approval_doc.py` — re-implement V1 `ApprDoc.py` on V2 approval feed (source dataset TBC)
- [ ] `silver_ufo_path.py` — re-implement V1 `UFOPath.py`
- [ ] `silver_ufo_icao.py` — re-implement V1 `ICAOObjects.py` + operator-ICAO patch reference table
- [ ] Repoint parity harness `RIDS["v2.bronze.techrequest_index"]` → Silver `ufo_entry` (one-line change in `_parity_utils.py`)
- [ ] Extend parity harness to cover `ufo_message` and `ufo_approval_doc`
- [ ] Hit ≥ 99.5% match on all prioritization-relevant fields
- [ ] Sign-off: parity report exported and approved by data steward

---

## 5. Phase 3 — Ontology re-shape

Build the V2 ontology surface in Ontology Manager, replacing V1 column names with the canonical V2 names. The technical spec is authored; Foundry creation is the next step.

### Spec & design (authored)

- [x] `docs/UFO_V2_Ontology_Spec.md` — implementation-depth catalogue (1,197 lines) covering object types, link types, action types, function-backed properties, value types, struct types, shared properties, V1↔V2 column mappings, backing-dataset lineage
- [x] `_ProjectReview/UFO_V2_Phase3_Ontology_Proposal.docx` — interface and migration approach

### Value types (6 — pending)

- [ ] `vt_icao_code`
- [ ] `vt_ata_chapter`
- [ ] `vt_ata_reference`
- [ ] `vt_aircraft_msn`
- [ ] `vt_dossier_id`
- [ ] `vt_dossier_internal_id`

### Shared properties (6 — pending)

- [ ] All six shared property types per Ontology Spec §4

### Struct types (3 — pending)

- [ ] `st_comment_entry`
- [ ] `st_action_log_entry`
- [ ] `st_priority_parameter_config`

### Interface (pending)

- [ ] `TechRequestDossier` interface — required properties, default views, permissioning

### Object types (5 new + 1 reshaped — pending)

- [ ] `ufo_entry` (reshape — V2 column names; implements `TechRequestDossier`)
- [ ] `ufo_post_treatment`
- [ ] `ufo_interruption`
- [ ] `ufo_manufacturing_quality_rfi`
- [ ] `ufo_company`
- [ ] Confirm `ufo_fsr`, `ufo_path`, `ufo_icao`, `ufo_approval_doc` keep V1 identity (or document deltas)

### Link types (11 — pending)

- [ ] `lt_entry_to_linked_dossier` (Move/Copy)
- [ ] Remaining 10 link types per Ontology Spec §6
- [ ] Verify cardinality + back-reference labels

### Actions (5 — pending)

- [ ] All five action types per Ontology Spec §8 (incl. `addComment` once Functions V2 is bound)

### Sign-off (pending)

- [ ] All objects created on the dev ontology branch
- [ ] Ontology proposal review meeting completed
- [ ] Branch promoted to production ontology

---

## 6. Phase 4 — Functions V2 (TypeScript) port

Port **every** V1 TypeScript ontology function module to Functions V2 in `UFO_OntologyObject_Functions_V2/`, one module at a time, using the pure-logic / adapter pattern proven by the Comments spike. Comments is complete; seven module ports remain. Order is per the Functions V2 Spike Design Note §10, sized easiest-to-hardest so risk concentrates on the priority engine port at the end.

### V2 project scaffolding

- [x] `UFO_OntologyObject_Functions_V2/` standalone npm project (`package.json`, `tsconfig.json`, `vitest.config.ts`)
- [x] `src/types/foundry-stubs.ts` aliased by both `tsconfig.paths` and `vitest.config.ts` so pure modules typecheck and test outside Foundry
- [x] Pure-logic / adapter separation enforced: `parse.ts`, `views.ts`, `types.ts`, `dictionary.ts` have **no** `@foundry/*` imports
- [x] `npm run typecheck` clean

### Comments module (✅ first port — complete)

- [x] `src/comments/types.ts` — `CommentEntry`, `LinkedCommentEntry`, `CommentCode`, `ViewCode`, `CountsByCode`
- [x] `src/comments/dictionary.ts` — user UUID → display name map
- [x] `src/comments/parse.ts` — three V1 string formats, ISO + millis timestamps, null-safe (pure)
- [x] `src/comments/views.ts` — filter-by-code, most-recent, count, markdown render, mention resolution (pure)
- [x] `src/comments/adapter.ts` — Foundry FBP decorators + `Ufoentry` / `UfoFsr` bindings (10 properties)
- [x] `test/comments/parse.test.ts` — ~70 cases passing
- [x] `test/comments/views.test.ts` — ~60 cases passing
- [x] `test/comments/fixtures.ts` — shared sample data
- [x] Spike methodology captured in `_ProjectReview/UFO_V2_FunctionsV2_Spike_Comments.docx`

### Remaining V2 module ports (Spike Design Note §10 order)

Each port follows the eight-step template: `types` → `dictionary` (where applicable) → pure `parse` / `views` modules → Foundry `adapter` → vitest cases → smoke deploy to Foundry → bind function-backed properties / actions → deprecate the V1 binding. Pure-logic files must not import from `@foundry/*`; the Foundry surface lives in `adapter.ts` only.

- [x] **#1 Comments** → `src/comments/` (spike + template). Done.
- [ ] **#2 FSRFunctions** (`scanandDelete`, `scenarioFSRMatch`, `addAndupdateFSRFavs`, `removeAndupdateFSRFavs`) → `src/fsr/{identity,favorites}.ts`
- [ ] **#3 fsrTeam + Misc** (`setTeamMembers`, `commentFlag`) → `src/fsr/teams.ts`
- [ ] **#4 restoration** (`returnRestoredList`, `returnRestoredList_number`, `filterChange`) → `src/dashboard/restoration.ts`
- [ ] **#5 reportGenerator** (`reportDriver`, `getEscalations`, `getComments`, `formatComments`) → `src/reporting/escalation_digest.ts` — 24-hour HTML report
- [ ] **#6 index.ts priority driver** (`priorityDriver`, `configureAlgorithm`, `calculateGlobalScore`, `setSharedProperties`, `updatelatestRts`) → `src/prioritization/algorithm.ts` — largest port (~1,350 lines, ~50 methods); depends on V2 ontology surface (Phase 3)
- [ ] **#7 index.ts fsrEntryDriver** + stored-action replay → `src/fsr/edit.ts`
- [ ] **#8 index.ts escalation lifecycle** (`escalate`, `deEscalate`, `createEscalationObject`) → `src/escalation/lifecycle.ts`

### Shim retirement (end of P4)

- [ ] Once port #6 (priority driver) deploys, retire `UFO_OntologyObject_Functions/v2compat.ts` — V2 functions consume V2 parameter keys natively, so the key-rewrite shim is no longer needed
- [ ] `DataTransformationRepository/v2_compat.py` stays in place until P6 V1 PySpark sunset — it bridges a different concern (V1 PySpark transforms accepting V2 column shapes)

### Deployment (pending)

- [ ] Deploy `UFO_OntologyObject_Functions_V2/` to Foundry Functions V2 runtime
- [ ] Bind the 9 Comments function-backed properties on `ufo_entry` per Ontology Spec §7.3 (`commentBreakdownMd`, `commentsTechnicalMd`, `commentsPartsMd`, `commentsCustSuppMd`, `mostRecentTechnicalCommentMd`, `mostRecentPartsCommentMd`, `mostRecentCustSuppCommentMd`, `linkedCommentsMd`, `mostRecentLinkedCommentMd`)
- [ ] Bind the `addComment` action
- [ ] Decommission the V1 `Comments.ts` bindings on Workshop dashboards
- [ ] Switch monitoring dashboards to V2 function metrics

---

## 7. Phase 5 — Incrementality & scale (not started)

- [ ] Convert Bronze transforms to incremental mode (snapshot input → append-only Bronze)
- [ ] Add upstream watermark + late-arriving-row policy per dataset
- [ ] Backfill strategy documented and rehearsed on a non-production branch
- [ ] Performance benchmark: Bronze build < target SLA at production volume
- [ ] Cost / compute baseline captured per dataset
- [ ] Alerting: build duration, row-count drift, schema drift, DQ-column violations

---

## 8. Phase 6 — Cutover & decommission (not started)

- [ ] Workshop dashboards repointed from V1 ontology objects → V2 ontology objects
- [ ] Subscriptions / scheduled exports repointed
- [ ] Stakeholder sign-off on V2 behaviour (UAT on held-out parity sample)
- [ ] V1 transforms put into read-only/observability mode
- [ ] V1 transforms decommissioned and datasets archived
- [ ] V1 ontology functions repo (`UFO_OntologyObject_Functions/`) archived
- [ ] V1↔V2 shims removed (see Workstream X)
- [ ] Final migration retrospective + postmortem doc

---

## 9. Workstream X — V1 forward-compatibility shims

Lets V1 keep producing correct output even when fed V2-shaped inputs, so the migration can be sequenced without breaking the V1 line.

### PySpark shim — `DataTransformationRepository/v2_compat.py`

- [x] `V2_TO_V1_DOSSIER_INDEX` mapping (45 fields)
- [x] `V2_TO_V1_MESSAGES` mapping (12 fields)
- [x] `V2_TO_V1_APPROVAL` mapping (6 fields)
- [x] TZ-pair fold per feed (5 + 3 + 4 pairs) using identical UTC contract to Bronze
- [x] `maybe_normalize_dossier_index`, `maybe_normalize_messages`, `maybe_normalize_approval` — auto-detecting + idempotent
- [x] Integrated at top of `UFOEntries.py`, `MessageParsing.py`, `ApprDoc.py`, `NicoTest.py`

### TypeScript shim — `UFO_OntologyObject_Functions/v2compat.ts`

- [x] `V2_TO_V1_PRIORITY_KEYS` (49 entries) — identity, classification, aircraft, powerplant/component, ATA, parties, lifecycle timestamps, message rollups
- [x] `toV1PriorityKey(key)` exported and consulted by `index.ts` priority driver
- [x] Passthrough on unknown keys (preserves V1 "no score" default)

### Remaining

- [ ] Shim coverage smoke test in CI — run V1 transforms on a V2 sample row and assert key V1 outputs unchanged
- [ ] Remove shims as Phase 6 decommission completes (target: post V1 sunset)

---

## 10. Cross-cutting — docs, tooling, repo hygiene

- [x] `CLAUDE.md` — repo onboarding, layout, build/test commands, migration architecture, conventions
- [x] `docs/UFO_V2_Ontology_Spec.md` — 1,197-line implementation-depth ontology spec
- [x] `_ProjectReview/UFO_V2_Initial_Project_Review.docx`
- [x] `_ProjectReview/UFO_V2_Scope_Confirmation_Worksheet.docx`
- [x] `_ProjectReview/UFO_V2_Phase1_Bronze_Design_Note.docx`
- [x] `_ProjectReview/UFO_V2_Parity_Harness_Design_Note.docx`
- [x] `_ProjectReview/UFO_V2_Phase3_Ontology_Proposal.docx`
- [x] `_ProjectReview/UFO_V2_FunctionsV2_Spike_Comments.docx`
- [x] `_ProjectReview/UFO_V2_V1_Forward_Compatibility_Prep.docx`
- [x] `_ProjectReview/UFO_V2_Implementation_Checklist.md` (v1.1 working tracker)
- [x] `Practice_Run/` local PySpark harness — config, runners, stubbed `transforms.api`, `run_all.py`
- [x] Five V2 source CSVs staged under `Data/`
- [x] No `TODO` / `FIXME` / `XXX` debt in `v2_bronze/`, `v2_parity/`, or `UFO_OntologyObject_Functions_V2/src/`

### Remaining

- [ ] CI: run `Practice_Run/run_all.py --skip-parity` on PRs touching `v2_bronze/` or `v2_parity/`
- [ ] CI: `npm run typecheck && npm test` in `UFO_OntologyObject_Functions_V2/` on every PR
- [ ] Replace placeholder root `main.py` / `pyproject.toml` scaffold, or document it as intentional
- [ ] Populate top-level `README.md` (or delete and rely on `CLAUDE.md`)

---

## 11. Inventory — what exists today

### DataTransformationRepository
- **V1 transforms (retained):** `UFOEntries.py`, `MessageParsing.py`, `ApprDoc.py`, `UFOPath.py`, `ICAOObjects.py`, `NicoTest.py`
- **V2 Bronze:** `v2_bronze/_bronze_utils.py` + 5 Bronze transforms
- **V2 Parity:** `v2_parity/_parity_utils.py` + `parity_ufo_entry.py`
- **Shim:** `v2_compat.py`

### UFO_OntologyObject_Functions (V1, source for the V2 port)
- `index.ts` (priority engine, 1,369 lines — port targets `src/prioritization/`, `src/fsr/edit.ts`, `src/escalation/lifecycle.ts`)
- `Comments.ts` (677 lines — already ported to V2 spike; deprecated at cut-over)
- `FSRFunctions.ts`, `fsrTeam.ts`, `Misc.ts`, `restoration.ts`, `reportGenerator.ts`, `PathSupp.ts`, `commentUsersDictionary.ts`
- `v2compat.ts` (transitional; retires when port #6 priority driver lands)

### UFO_OntologyObject_Functions_V2 (V2, in flight — all 8 ports landing here)
- `src/comments/` — types, dictionary, parse, views, adapter, index (✅ ported)
- `src/fsr/`, `src/dashboard/`, `src/reporting/`, `src/prioritization/`, `src/escalation/` — ⬜ to be created during ports #2–#8
- `src/types/foundry-stubs.ts`
- `test/comments/` — parse + views + fixtures (✅ tests passing); each new module adds its own `test/{domain}/` suite

### Practice_Run
- `config.py`, `run_all.py`, `transforms/api.py`, `runners/_common.py` + 5 Bronze runners + 1 parity runner

### Data (V2 samples)
- `techrequest_index_metadata_v2.csv`, `tr_dossier_metadata_filtered.csv`, `tr_messages_metadata.csv`, `tr_manufacturing_quality_reference.csv`, `tr_linked_dossier.csv`

### Documentation
- `docs/UFO_V2_Ontology_Spec.md`
- `_ProjectReview/` — 8 design docs + 1 working checklist + 1 user-guide PDF
- `Documentation/` — 20 product PDFs (user-facing)

---

## 12. Critical path to V2 production

The single critical path from "today" to "V1 retired" is:

1. **P0 sign-off** → V1 baseline captured
2. **P1 Foundry binding** → Bronze running in Foundry against real RIDs
3. **P2 Silver `ufo_entry`** → parity ≥ 99.5%, then the remaining four Silver transforms
4. **P3 Ontology creation** → value types, struct types, shared properties, object types, link types, actions, all on a dev ontology branch
5. **P4 Functions V2 full port** → deploy Comments first (bind 9 FBPs + `addComment` action on V2 `ufo_entry`, deprecate V1 `Comments.ts` bindings); then port FSRFunctions → fsrTeam+Misc → restoration → reportGenerator → priority driver (`index.ts`) → fsrEntryDriver → escalation lifecycle in Spike Design Note §10 order. Each port replaces its V1 binding in Ontology Manager and moves the V1 source file out of the active build. `v2compat.ts` retires once the priority driver port lands.
6. **P5 Incrementality** → Bronze and Silver running on append-only schedules at production scale
7. **P6 Cutover** → repoint Workshop, sign-off, archive V1, remove shims

Phases 2 → 3 → 4 are partially parallelisable: ontology Phase 3 creation can begin once the Silver `ufo_entry` schema is stable, and Functions V2 module ports beyond Comments depend on the V2 ontology surface being available on a dev branch.

---

*This file is a snapshot in time. The authoritative working tracker is `_ProjectReview/UFO_V2_Implementation_Checklist.md`; update both when phase status changes.*
