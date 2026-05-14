# UFO V2 — Phase 4 Functions Port Tracker

**Scope.** Tracks the port of `UFO_OntologyObject_Functions/` (V1, TypeScript v1, Foundry-only) into `UFO_OntologyObject_Functions_V2/` (V2, TypeScript v2, locally testable via vitest).

**Status as of 2026-05-13.** Comments module ported (the Phase 4 spike). Everything else still V1-only and reached through the `v2compat.ts` shim. Most remaining ports are **gated by Phase 3 (Ontology re-shape)** because they bind directly to V1 column names on `Ufoentry`, `UfoFsr`, `UfopathObject`, `UfoApprovalDocument`, etc. Porting before Phase 3 would mean either (a) re-introducing a shim inside the V2 module, or (b) churning the V2 code again immediately after the ontology lands.

**Per-module port pattern (the contract Comments established).**
1. Pure-logic core: `parse.ts` / `views.ts` / `types.ts` (no `@foundry/*` imports).
2. Foundry surface confined to `adapter.ts`.
3. Module barrel `index.ts` exports the V2-shaped class.
4. Vitest fixtures + tests against the pure core.
5. New Foundry symbols added to `src/types/foundry-stubs.ts` so typecheck and tests resolve.
6. Top-level `index.ts` (router) re-exports the new class.

---

## Legend

- `[ ]` not started
- `[~]` in progress
- `[x]` complete
- `[!]` blocked — see "Blocker" line
- `[-]` won't port (dead code or superseded)

---

## Module ports

### Comments — `src/comments/`
- [x] Pure core: `parse.ts`, `views.ts`, `dictionary.ts`, `types.ts`
- [x] `adapter.ts` (Foundry surface)
- [x] Module `index.ts`
- [x] Vitest fixtures + parse tests
- [x] V1 reference retired? **No** — V1 `Comments.ts` still wired in `UFO_OntologyObject_Functions/index.ts`. Decide cutover when remaining modules ship.

### FSRFunctions — port to `src/fsr/`
- [x] Inventory the 5 V1 functions in `FSRFunctions.ts` and classify each as pure vs. Foundry-bound
- [x] Pure core: `fsr/types.ts` (constants), `fsr/identity.ts` (`isInactive`), `fsr/favorites.ts` (`addFavorites`, `removeFavorites`, `isFavoriteOf`)
- [x] `fsr/adapter.ts` for `UfoFsr` / `Ufoentry` ontology calls (`scanAndDelete`, `scenarioFSRMatch`, `scenarioDriverandReturnFSRFav`, `addAndUpdateFSRFavs`, `removeAndUpdateFSRFavs`)
- [x] Module `index.ts`
- [x] Vitest cases for the pure core (identity.test.ts complete; favorites.test.ts written — bodies pending user fill-in of TODOs in `favorites.ts`)
- [x] Stubs added to `foundry-stubs.ts`: `UfoFsr.favorites`, `UfoFsr.delete()`, `Ufoentry.isFavorite`, `Objects.search().ufoFsr()`
- [x] V1 → V2 deltas applied: `currentLogIn` → `lastLogIn`; `scanandDelete` operand-order bug fixed; missing-`lastLogIn` policy = skip; `scenarioFSRMatch` no longer mutates entries, returns `FunctionsMap<Ufoentry, boolean>` instead.
- [ ] V1 reference retired in `UFO_OntologyObject_Functions/index.ts` — defer until remaining modules ship.

### fsrTeam — port to `src/fsr-team/` (or fold into `fsr/`)
- [ ] Decide: standalone module vs. merged into `fsr/`
- [ ] Pure core
- [ ] Adapter
- [ ] Tests
- **Blocker:** Phase 3.

### Misc — port to `src/misc/`
- [ ] Triage: only **1** `@OntologyEditFunction` is active (line 86); 4 others are commented out. Confirm with user which (if any) commented-out functions should be revived in V2.
- [ ] Pure core for the active function
- [ ] Adapter
- [ ] Tests
- **Blocker:** Phase 3 (the active function touches `Ufoentry` properties that are renaming).

### reportGenerator — port to `src/reports/`
- [ ] Inventory the 4 V1 `@Function` methods
- [ ] Pure core for report assembly + formatting
- [ ] Adapter for ontology reads
- [ ] Tests against fixture inputs
- **Blocker:** Phase 3 — reports stitch across `Ufoentry`, comments, FSR data; format depends on V2 column shape.

### restoration — port to `src/restoration/`
- [ ] Inventory the 3 V1 `@Function` methods
- [ ] Pure core
- [ ] Adapter
- [ ] Tests
- **Blocker:** Phase 3 (verify dependencies first; may be lighter-touch than reports).

### PathSupp
- [-] **Won't port as-is.** Entire file is commented out in V1; import is also commented in `UFO_OntologyObject_Functions/index.ts`. Action: either delete in V2 or re-spec from scratch if a path-support feature is desired.
- [ ] Confirm with product whether to revive the concept in V2

### commentUsersDictionary
- [-] **Already superseded.** V2 ships `src/comments/dictionary.ts` as the equivalent. V1 file can be retired when V1 module is.

### `index.ts` (root router) — port to V2 `src/index.ts`
- [ ] **Largest single piece of work.** ~30 decorated methods across `priorityDriver`, configuration, scoring, edits.
- [ ] Split: extract `PriorityAlgorithm` scoring into `src/priority/` (pure core: scoring math; adapter: `Objects.search().priorityAlgorithm()` and edits).
- [ ] Pure core: scoring, `getPriorityValsForOneEntry`, `calculateGlobalScore`, `configureAlgorithm` reshape
- [ ] Adapter: `priorityDriver`, `priorityDriverTester`, all `@OntologyEditFunction` methods
- [ ] Tests for scoring against fixtures (high value — currently no tests on this code path)
- [ ] Cutover: replace `toV1PriorityKey` shim usage with V2-native parameter keys in the V2 module; **leave** the V1 shim in place until V1 is retired
- **Blocker:** Phase 3 — `Ufoentry` properties referenced (`operatorICAOCode`, `aircraftStatus`, `highestMessageUrgency`, `sbcbump`, `globalPriorityScore`, …) are all renaming.

---

## Cross-cutting work

- [ ] **Foundry stubs**: every new ontology object (`Ufoentry`, `UfoFsr`, `UfoICAO`, `UfopathObject`, `Fsrteam`, `PriorityAlgorithm`, `UfoApprovalDocument`) and every new `Objects.search().*` chain touched by a port needs an entry in `src/types/foundry-stubs.ts`.
- [ ] **`package.json`** — add the new module entries to the build target list (currently only `comments` is wired).
- [ ] **`tsconfig.paths`** — confirm path aliases cover any new sub-folders.
- [ ] **CI**: confirm `npm run typecheck && npm test` is wired in CI on the V2 directory; today it runs locally only.
- [ ] **README** for `UFO_OntologyObject_Functions_V2/` — currently absent. Add a short "what's ported, what's pending, how to add a module" doc.

---

## Cutover criteria (definition of done for Phase 4)

- All V1 modules above marked `[x]` or `[-]`.
- V2 `index.ts` re-exports a complete class equivalent to V1 `MyFunctions`.
- V2 typecheck + vitest pass.
- Foundry deployment of the V2 functions module succeeds in a staging space, with each function callable from Workshop.
- V1 `UFO_OntologyObject_Functions/` is either archived (read-only) or deleted, and `v2compat.ts` (the V1-side shim) is retired alongside it.
- Phase 3 ontology re-shape is fully landed (precondition for retiring `v2_compat.py` on the PySpark side too — but that is tracked separately).

---

## Suggested port order (after Phase 3 lands)

1. **`restoration`** — likely smallest surface; good warm-up for the V2 patterns beyond Comments.
2. **`reportGenerator`** — read-mostly, no edit semantics; good "is the V2 shape exposing what we need" sanity check before tackling priority.
3. **`fsrTeam` + `FSRFunctions`** — port together; they share an object surface.
4. **`Misc`** — confirm scope first (commented-out functions); then port what's live.
5. **`index.ts` priority driver** — last, biggest, riskiest. Do this with the scoring-math split (pure core + adapter) so the math is finally test-covered.

---

## Open questions for the user

1. Should `PathSupp` be deleted in V2 or re-specified? Currently 100% commented out.
2. Should the four commented-out `Misc` functions be revived as part of the V2 port, or left dropped?
3. Do we want V2 functions to **co-exist** with V1 in production for a parity window (similar to the parity harness on the PySpark side), or is the cutover atomic at deployment time?
4. Is there appetite to invest in test coverage for the Priority scoring math during the port? (Strong recommendation: yes — it's untested today and the most complex logic in the repo.)
