# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This repo holds the UFO (Unified Fleet Operations) ontology project, mid-migration from V1 to V2 of the upstream **TechRequest** dossier feed. Four sibling top-level directories carry code; the rest are reference material.

- **`DataTransformationRepository/`** — Foundry PySpark transforms. `*.py` files at the top level are V1 transforms (`UFOEntries.py`, `MessageParsing.py`, `ApprDoc.py`, `UFOPath.py`, `ICAOObjects.py`). `v2_bronze/` and `v2_parity/` are V2-only Python packages. `v2_compat.py` is the V1↔V2 compatibility shim — see "Migration architecture" below.
- **`UFO_OntologyObject_Functions/`** — V1 Foundry ontology functions (TypeScript). `index.ts` is the main entry; `Comments.ts`, `FSRFunctions.ts`, `Misc.ts`, `reportGenerator.ts` etc. are domain modules. `v2compat.ts` is the V1↔V2 shim for `PriorityAlgorithm` parameter keys.
- **`UFO_OntologyObject_Functions_V2/`** — Standalone npm/TypeScript project for the **V2** ontology functions. Phase 4 spike; **Comments** is the first module ported. Has its own `package.json`, `tsconfig.json`, vitest config.
- **`Practice_Run/`** — Local-laptop scaffolding to run the V2 PySpark transforms outside Foundry. Stubs `transforms.api`, provides per-transform runner scripts, and writes parquet to `Practice_Run/output/`. See "Practice_Run (local PySpark execution)" below.
- **`Data/`** — CSV samples for both V1 and V2 source feeds. Used as input by `Practice_Run/`; also reference for the Foundry side.
- **`Documentation/`** — PDF user/feature guides for the UFO product.
- **`docs/`** — Design notes in Markdown. `UFO_V2_Ontology_Spec.md` is the current V2 ontology spec.
- **`_ProjectReview/`** — Design notes and proposals for the V1→V2 migration (`UFO_V2_*.docx`). Useful background but not code.

The root-level `pyproject.toml`, `main.py`, `uv.lock`, and `.venv/` are a placeholder `uv` scaffold — `main.py` just prints "Hello". They are **not** the project entry point. Real Python work happens under `DataTransformationRepository/` (Foundry) and `Practice_Run/` (local).

## Build / test / typecheck

The two TypeScript projects and the PySpark code have different toolchains.

### V2 TypeScript functions (`UFO_OntologyObject_Functions_V2/`)

```bash
cd UFO_OntologyObject_Functions_V2
npm install            # first time
npm run typecheck      # tsc --noEmit
npm test               # vitest run
npm run test:watch     # vitest watch
```

Run a single test file: `npx vitest run test/comments/parse.test.ts`
Run a single test by name: `npx vitest run -t "parses a millis-timestamped entry comment"`

The Foundry packages `@foundry/functions-api` and `@foundry/ontology-api` are **not installable** outside Foundry. They are aliased to `src/types/foundry-stubs.ts` by both `tsconfig.paths` (typecheck) and `vitest.config.ts` `resolve.alias` (tests). Pure logic lives in `parse.ts` / `views.ts` / `dictionary.ts` / `types.ts` and is what tests exercise; the `adapter.ts` shim is typechecked only. When adding a new Foundry symbol the adapter touches, add it to `foundry-stubs.ts`.

### V1 TypeScript functions (`UFO_OntologyObject_Functions/`)

No local toolchain — these files compile only inside Foundry. There is no `package.json`. Do not try to `tsc` them. If you need to validate edits, port the affected logic into the V2 project (which has tests) or read carefully.

### PySpark transforms (`DataTransformationRepository/`)

In Foundry these run under `transforms.api`. The decorator pattern is `@transform(... Input(rid), Output(rid))` with explicit Foundry RIDs in the source — those bind to specific datasets per environment.

Locally, use `Practice_Run/` to drive the V2 transforms (Bronze + parity) against the CSVs in `Data/`. The V1 transforms have no local harness — rely on Foundry CI/Code Review for those.

### Practice_Run (local PySpark execution)

```bash
pip install -r Practice_Run/requirements.txt     # PySpark 3.5, pandas, pyarrow
python Practice_Run/run_all.py                   # all five Bronze stages + parity
python Practice_Run/run_all.py --skip-parity     # bronze only
python Practice_Run/run_all.py --only bronze.linked_dossier
python Practice_Run/runners/run_bronze_techrequest_index.py   # single stage
```

Requires Java 11 or 17 on PATH (PySpark dependency). Parquet output lands in `Practice_Run/output/`. The harness works by shadowing the Foundry `transforms` package with `Practice_Run/transforms/` (an identity-decorator stub) — the runners call each V2 module's bare `_transform(df)` function directly, never the `@transform`-decorated `compute()`. When adding a new V2 dataset, mirror the entry in both `Practice_Run/config.py::DATASETS` and `DataTransformationRepository/v2_bronze/_bronze_utils.py::RIDS` so the two sides stay in lockstep.

## Migration architecture (V1 ↔ V2)

The project is mid-migration and this is the single most important thing to understand before editing.

**V1 = existing, in production.** Column names like `id_dossier`, `dossierTitle`, `operatorICAOCode`, with timestamps as single columns. The V1 PySpark transforms and the V1 ontology functions consume V1-shaped data.

**V2 = upstream TechRequest V2 feed.** Snake_case column names (`dossier_id`, `dossier_title`, `operator_code_icao`), and every timezone-aware timestamp split into a `(value, *_tz)` string pair.

The migration has four phases, and code is in flight for several at once:

1. **Phase 1 — Bronze** (`v2_bronze/`). Raw, schema-enforced ingest of the five V2 source files into Foundry datasets. Content-preserving — no business logic. Every Bronze table has `_ingested_at`, `_source_dataset`, `_row_uid` data-quality columns and a `(value, *_tz)` pair folded to one UTC `TimestampType` column.
2. **Phase 2 — Silver** (not yet built). Will plug into the parity harness in place of Bronze.
3. **Phase 3 — Ontology re-shape** (not yet built). Retires V1 column names from the ontology entirely.
4. **Phase 4 — Comments V2 cut-over** (`UFO_OntologyObject_Functions_V2/`). Replace V1 `Comments.ts` bindings with `CommentsV2` function-backed properties + the `addComment` action, keeping V1 string storage shape. **Comments is the only V2 port.** The remaining V1 modules (`index.ts` priority engine, `FSRFunctions`, `Misc`, `fsrTeam`, `reportGenerator`, `restoration`) are retained in V1 indefinitely per Ontology Spec §7.2 and bridged by `v2compat.ts`. Phases 5–6 cover lifecycle actions and V1 sunset, not further re-ports.

### The compatibility shims

Until Phase 3 lands, V1 code may receive V2-shaped inputs. Two shims bridge this:

- **`DataTransformationRepository/v2_compat.py`** — for the V1 PySpark transforms. Exposes `maybe_normalize_dossier_index`, `maybe_normalize_messages`, `maybe_normalize_approval`. Each is **auto-detecting** (sniffs `dossier_id` vs `id_dossier`) and **idempotent** — passthrough on V1 input, rename + TZ-fold on V2 input. Called at the top of each V1 transform's `compute()`/`driver()`. V1 transform logic below the call site is unchanged and continues to reference V1 column names. **The shim is the only V2 awareness in the V1 PySpark repo.**
- **`UFO_OntologyObject_Functions/v2compat.ts`** — for the V1 ontology functions. Exposes `toV1PriorityKey(key)` which rewrites a `PriorityAlgorithm` parameter key from V2 spelling to V1 spelling before the V1 driver's `switch` consumes it. Unknown keys pass through (preserving V1's "no match → no score contribution" default).

When editing V1 code that touches a column name or parameter key, check whether the shim covers it. When adding a new V2 column or PriorityAlgorithm parameter, extend the mapping table in the relevant shim — do not modify the V1 consumer to know about V2.

### Parity harness (`v2_parity/`)

`parity_ufo_entry.py` joins the V1 `UfoEntry` output against the V2 Bronze `techrequest_index` on **`dossier_internal_id`** (NOT the numeric `dossier_id`, which is not stable across migrated dossiers) and emits:

- `parity.ufo_entry_diff` — one row per `(dossier_internal_id, field)`.
- `parity.ufo_entry_summary` — per-field match counts and percentages.

The harness is read-only — it does not modify V1 or `v2_bronze`. When the Silver V2 UfoEntry is built (Phase 2), the parity input is rebound by editing `RIDS["v2.bronze.techrequest_index"]` — no other code changes.

## Conventions worth knowing

- **V2 Bronze TZ contract**: every V2 `(value, *_tz)` pair is normalized to a single UTC `TimestampType` column. The companion `*_tz` is kept for downstream display use. Same contract is used by `v2_compat.py` when folding pairs into V1-named single columns, so a row that flows through either path produces an identical timestamp.
- **V2 Functions purity boundary**: business logic in `src/comments/parse.ts` and `src/comments/views.ts` must not import from `@foundry/functions-api` or `@foundry/ontology-api`. The Foundry surface is confined to `adapter.ts`. This is what makes the V2 module unit-testable.
- **No Foundry imports in `parse.ts`/`views.ts`/`types.ts`/`dictionary.ts`** — they are the pure-logic core.
- **Foundry RIDs** appear as literal strings in `@transform(...)` decorators and string keys in `v2_parity/_parity_utils.RIDS`. They are environment-specific; do not assume one matches another.
- **Comment serialization** (V1 storage format the V2 adapter still has to read): millis-or-ISO timestamp, then code, then body, delimited — see `parse.test.ts` for the canonical shapes the parser must accept.
