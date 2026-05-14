/**
 * Prioritization V2 — Foundry adapter.
 *
 * Decorated entry points the ontology runtime invokes. Pulls the active
 * `PriorityAlgorithm`, fills span bounds from the entry set, then defers
 * to the pure layer in `algorithm.ts` for the actual scoring math. This
 * file is the *only* place `@foundry/*` symbols appear in the
 * prioritization module — pure parity with the Comments spike.
 *
 * Replaces these V1 entry points in `UFO_OntologyObject_Functions/index.ts`:
 *
 *   V1 method                       →  V2 adapter
 *   ──────────────────────────────────────────────────────────────────────
 *   priorityDriver                  →  PrioritizationV2.priorityDriver
 *   priorityDriverTester            →  PrioritizationV2.priorityDriverTester
 *   sbcBumpAndPriorityCalc          →  PrioritizationV2.sbcBumpAndPriorityCalc
 *   calculateOneEntryScore          →  PrioritizationV2.calculateOneEntryScore
 *   configureAlgorithm              →  (inlined; pure config build below)
 *   setMainConfig                   →  PrioritizationV2.setMainConfig
 *
 * V1's `getPriorityValsForOneEntry`, `calculateGlobalScore`,
 * `calculatePropertyScore`, `spanorBlock`, `findBounds`,
 * `isoStringtoDaysSince`, `removeDashesAndCondense`, `sort` are pure and
 * tested in `algorithm.ts`, `score.ts`, `bounds.ts`, `parameters.ts`.
 *
 * The shim `UFO_OntologyObject_Functions/v2compat.ts` retires when the V1
 * priority bindings are removed in Ontology Manager (the last step of
 * port #6 — see task #8).
 */

import {
  Edits,
  OntologyEditFunction,
} from "@foundry/functions-api";
import {
  Objects,
  PriorityAlgorithm,
  Ufoentry,
  type ObjectSet,
} from "@foundry/ontology-api";
import { calculateGlobalScore } from "./algorithm.js";
import { parameterDef } from "./parameters.js";
import type { PureParameterEntry, PriorityAlgorithmConfig } from "./types.js";
import { daysSince } from "./bounds.js";

/**
 * Find the active `PriorityAlgorithm` — the singleton with
 * `mainConfigFlag === 1`. Mirrors V1 lines 42 / 214.
 */
function activeAlgorithm(): PriorityAlgorithm | undefined {
  return Objects.search()
    .priorityAlgorithm()
    .all()
    .filter((a) => a.mainConfigFlag === 1)[0];
}

/**
 * Resolve a `PriorityAlgorithm` into the pure `PriorityAlgorithmConfig`
 * the algorithm layer expects. Span slots get their bounds filled from
 * the entry set here (replaces V1's `findBounds` switch in lines 800–858).
 *
 * The fill is async because Foundry's `ObjectSet.max/min` are async.
 */
async function resolveConfig(
  algo: PriorityAlgorithm,
  entries: ObjectSet<Ufoentry>,
): Promise<PriorityAlgorithmConfig> {
  const slots: PureParameterEntry[] = [];
  for (const raw of algo.parameters ?? []) {
    const def = parameterDef(raw.key);
    if (def === undefined) {
      throw new Error(
        `PriorityAlgorithm references unknown parameter key "${raw.key}". ` +
          `Add it to src/prioritization/parameters.ts::PARAMETERS or remove ` +
          `it from the algorithm config.`,
      );
    }
    if (raw.isSpan) {
      const bounds = await spanBounds(raw.key, entries);
      slots.push({ key: raw.key, isSpan: true, tiers: [...bounds, "span"] });
    } else {
      slots.push({ key: raw.key, isSpan: false, tiers: raw.tiers });
    }
  }
  return {
    algorithmId: algo.algorithmId ?? "default",
    parameters: slots,
  };
}

/**
 * Compute [max, min] for a span-typed parameter, in the units the
 * algorithm layer expects. Numeric parameters return the raw min/max;
 * date parameters return days-since-now (matching V1 `findBounds`).
 */
async function spanBounds(
  key: string,
  entries: ObjectSet<Ufoentry>,
): Promise<[string, string]> {
  const def = parameterDef(key);
  if (def === undefined) return ["0", "0"];

  // Sample the reader against a sentinel undefined entry to detect date
  // strategies. We rely on the strategy classification instead, since
  // strategies are pinned in parameters.ts.
  if (def.strategy === "date") {
    // Date min/max use the same `read` selector but on Timestamp-typed
    // properties. Cast through `any` is unavoidable here because Foundry's
    // ObjectSet typing doesn't carry the per-property selector shape.
    const max = await entries.max((e) => def.read(e));
    const min = await entries.min((e) => def.read(e));
    const maxDays = max !== undefined ? daysSince(max) : 0;
    const minDays = min !== undefined ? daysSince(min) : 0;
    return [maxDays.toString(), minDays.toString()];
  }

  // Numeric strategies: max/min as numbers.
  const max = await entries.max((e) => Number(def.read(e) ?? 0));
  const min = await entries.min((e) => Number(def.read(e) ?? 0));
  return [(max ?? 0).toString(), (min ?? 0).toString()];
}

export class PrioritizationV2 {
  /**
   * Recompute the global priority score for every entry in `entries`
   * against the active `PriorityAlgorithm`. Replaces V1 `priorityDriver`.
   * Bound to the `recomputePriority` Action Type (Spec §6.3).
   */
  @OntologyEditFunction()
  @Edits(Ufoentry)
  public async priorityDriver(entries: ObjectSet<Ufoentry>): Promise<void> {
    const algo = activeAlgorithm();
    if (algo === undefined) return;
    const config = await resolveConfig(algo, entries);
    for (const e of entries.all()) {
      const bump = e.sbcbump ?? 0;
      e.globalPriorityScore = calculateGlobalScore(config, e, bump);
    }
  }

  /**
   * Same as `priorityDriver` but scored against a *parameter-supplied*
   * algorithm rather than the singleton. Used by Workshop scenarios that
   * preview a candidate weighting before promoting it via `setMainConfig`.
   * Replaces V1 `priorityDriverTester`.
   */
  @OntologyEditFunction()
  @Edits(Ufoentry)
  public async priorityDriverTester(
    entries: ObjectSet<Ufoentry>,
    algo: PriorityAlgorithm,
  ): Promise<void> {
    const config = await resolveConfig(algo, entries);
    for (const e of entries.all()) {
      const bump = e.sbcbump ?? 0;
      e.globalPriorityScore = calculateGlobalScore(config, e, bump);
    }
  }

  /**
   * Single-entry recompute — used when an FSR edit invalidates one
   * entry's score without disturbing the rest. Replaces V1
   * `calculateOneEntryScore`. The `entries` set is still required because
   * span-bound filling needs the global min/max.
   */
  @OntologyEditFunction()
  @Edits(Ufoentry)
  public async calculateOneEntryScore(
    entry: Ufoentry,
    entries: ObjectSet<Ufoentry>,
  ): Promise<void> {
    const algo = activeAlgorithm();
    if (algo === undefined) return;
    const config = await resolveConfig(algo, entries);
    entry.globalPriorityScore = calculateGlobalScore(config, entry, entry.sbcbump ?? 0);
  }

  /**
   * Apply an SBC bump and immediately recompute the score. Replaces V1
   * `sbcBumpAndPriorityCalc`.
   */
  @OntologyEditFunction()
  @Edits(Ufoentry)
  public async sbcBumpAndPriorityCalc(
    entry: Ufoentry,
    bump: number,
    entries: ObjectSet<Ufoentry>,
  ): Promise<void> {
    entry.sbcbump = bump;
    await this.calculateOneEntryScore(entry, entries);
  }

  /**
   * Promote `algo` to the active singleton, flipping every other
   * `PriorityAlgorithm.mainConfigFlag` to 0. Replaces V1 `setMainConfig`.
   * Bound to the `setPriorityAlgorithm` Action Type (Spec §6.3).
   */
  @OntologyEditFunction()
  @Edits(PriorityAlgorithm)
  public setMainConfig(
    algo: PriorityAlgorithm,
    configurations: ObjectSet<PriorityAlgorithm>,
  ): void {
    for (const a of configurations.all()) {
      a.mainConfigFlag = a.algorithmId === algo.algorithmId ? 1 : 0;
    }
  }
}
