/**
 * Prioritization V2 — pure algorithm orchestration.
 *
 * Replaces V1 `MyFunctions.configureAlgorithm` (index.ts:107) and
 * `MyFunctions.calculateGlobalScore` (index.ts:534). Two functions live
 * here:
 *
 *   - `getParameterValues(config, entry)`  — reads every active parameter
 *      off the entry. Replaces V1's 290-line switch via the parameter
 *      table in `parameters.ts`.
 *   - `calculateGlobalScore(config, entry, bump, now?)` — weighted sum
 *      of per-parameter scores. Same arithmetic-series weighting as V1:
 *      the kth parameter (0-indexed) gets weight `(n-k)/(n(n+1)/2)`, so
 *      slot 0 is most important.
 *
 * V2 simplification: the V1 `configureAlgorithm` walked 10 if/else blocks
 * filling `param1Config..param10Config`. V2 reads `parameters[]` directly
 * — no positional unpacking. Span-bound filling moves to the adapter so
 * this layer stays synchronous.
 *
 * No Foundry imports.
 */

import { parameterDef } from "./parameters.js";
import type { EntryLike } from "./parameters.js";
import { scoreOne } from "./score.js";
import type { ParameterValue, PriorityAlgorithmConfig } from "./types.js";

/**
 * Read every parameter named in `config.parameters` off `entry`. Unknown
 * parameter keys throw — V2 surfaces config errors loudly rather than
 * silently scoring zero like V1 did.
 */
export function getParameterValues(
  config: PriorityAlgorithmConfig,
  entry: EntryLike,
): ParameterValue[] {
  return config.parameters.map((slot) => {
    const def = parameterDef(slot.key);
    if (def === undefined) {
      throw new Error(
        `Unknown priority parameter key: "${slot.key}". ` +
          `Add an entry to src/prioritization/parameters.ts::PARAMETERS.`,
      );
    }
    return { key: slot.key, value: def.read(entry) };
  });
}

/**
 * Calculate the global priority score for one entry.
 *
 * Weighting math (preserved from V1):
 *
 *   n               = config.parameters.length
 *   arithmeticSum   = n × (n + 1) / 2
 *   weight(k)       = (n - k) / arithmeticSum       (k is 0-indexed slot)
 *
 *   score           = round(Σ weight(k) × scoreOne(slot[k])) + bump
 *
 * Edge cases:
 *   - Empty `parameters` → score = bump (V1 would divide by zero; V2 short-circuits).
 *   - `bump` undefined → treated as 0.
 *   - Date strategies use `now` for "days since today" math; pinnable in tests.
 */
export function calculateGlobalScore(
  config: PriorityAlgorithmConfig,
  entry: EntryLike,
  bump: number = 0,
  now: Date = new Date(),
): number {
  const n = config.parameters.length;
  if (n === 0) return bump;

  const arithmeticSum = (n * (n + 1)) / 2;
  const values = getParameterValues(config, entry);

  let score = 0;
  for (let k = 0; k < n; k++) {
    const slot = config.parameters[k];
    const def = parameterDef(slot.key);
    if (def === undefined) continue; // unreachable — getParameterValues threw
    const weight = (n - k) / arithmeticSum;
    score += scoreOne(def.strategy, slot.tiers, values[k], now) * weight;
  }
  return Math.round(score) + bump;
}
