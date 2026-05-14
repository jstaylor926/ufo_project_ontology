/**
 * Prioritization V2 — per-parameter scoring.
 *
 * Replaces V1 `MyFunctions.calculatePropertyScore` (1369-line index.ts,
 * lines 580-746). The V1 implementation dispatched by *membership in five
 * arrays* (`exact_Matches`, `spans`, `dates`, `binaryMatches`, `keywords`)
 * plus five hardcoded specials in the function body. V2 splits that into:
 *
 *   - `parameters.ts` — the strategy classification table + readers.
 *   - `score.ts`       — strategy → score math (this file).
 *
 * Parity stance (per port decision): V1 scoring constants are preserved
 * bug-for-bug. The known V1 oddities are documented as parity tests in
 * `test/prioritization/score.test.ts` and fixed in a follow-up.
 *
 * No Foundry imports.
 */

import { spanOrBlock, daysSince, normalizeDateSpan, removeDashes } from "./bounds.js";
import type { ParameterValue, ScoringStrategy } from "./types.js";

/**
 * Score a single parameter on a single entry. Returns a value in 0..100.
 *
 * @param strategy        Strategy classification for this parameter.
 * @param tiers           Parameter's tier values from the PriorityAlgorithm slot.
 * @param propAndVal      [key, value] from the parameter reader.
 * @param now             Clock for date strategies (default: real time).
 */
export function scoreOne(
  strategy: ScoringStrategy,
  tiers: ReadonlyArray<string>,
  propAndVal: ParameterValue,
  now: Date = new Date(),
): number {
  if (propAndVal.value === "No Value" || propAndVal.value === undefined) {
    return 0;
  }

  // V1's parameterConfig pre-treatment: filter undefined, condense dashes.
  // Undefined is filtered at the type level here; condense dashes for parity.
  const config = removeDashes(tiers);

  switch (strategy) {
    case "priority":
      if (propAndVal.value === "Amber") return 50;
      if (propAndVal.value === "Red") return 100;
      return 0;

    case "messageUrgency":
      if (propAndVal.value === "Regular") return 25;
      if (propAndVal.value === "Critical") return 50;
      if (propAndVal.value === "High") return 75;
      if (propAndVal.value === "AOG") return 100;
      return 0;

    case "aircraftStatus":
      if (propAndVal.value === "AOG") return 100;
      if (propAndVal.value === "Heavy Maintenance WSP") return 67;
      if (propAndVal.value === "Heavy Maintenance Visit") return 33;
      return 0;

    case "escalations":
      return Number(propAndVal.value) * 33;

    case "trStatus":
      switch (propAndVal.value) {
        case "At Customer":           return 100;
        case "Interim to Definitive": return 85.5;
        case "To Be Assigned":        return 71.25;
        case "At DO for Justif":      return 57;
        case "At DO for Repair":      return 42.75;
        case "At DOA":                return 28.5;
        case "RDAF Approved":         return 14.25;
        case "Completed":             return 0;
        default:                      return 0;
      }

    case "exactMatch": {
      if (config.length === 0) return 0;
      const interval = 100 / config.length;
      const index = config.indexOf(propAndVal.value);
      return index === -1 ? 0 : 100 - index * interval;
    }

    case "binary":
      return propAndVal.value === config[0] ? 100 : 0;

    case "span":
      // V1: when tier slot 3 is the literal "span", bounds are the first two
      // entries; otherwise the whole tier list is treated as bucket thresholds.
      if (config[2] === "span") {
        return spanOrBlock(propAndVal.value, [config[0], config[1]], true);
      }
      return spanOrBlock(propAndVal.value, config, true);

    case "date": {
      const days = daysSince(propAndVal.value, now);
      if (config[2] === "span") {
        const max = Number(config[0]);
        const min = Number(config[1]);
        const norm = normalizeDateSpan(days, max, min);
        return spanOrBlock(norm.value, norm.bounds, true);
      }
      return spanOrBlock(days.toString(), config, false);
    }

    case "keyword": {
      if (config.length === 0) return 0;
      const interval = 100 / config.length;
      for (let i = 0; i < config.length; i++) {
        if (propAndVal.value.includes(config[i])) {
          return 100 - i * interval;
        }
      }
      return 0;
    }
  }
}
