/**
 * Prioritization V2 — module barrel.
 *
 * Pure exports are stable across the migration; the adapter is the only
 * Foundry-touching surface and is re-exported for Functions V2 registration.
 */

export type {
  PureParameterEntry,
  PriorityAlgorithmConfig,
  ParameterValue,
  ScoringStrategy,
} from "./types.js";
export type { EntryLike, ParameterDef } from "./parameters.js";
export { PARAMETERS, parameterDef } from "./parameters.js";
export {
  spanOrBlock,
  daysSince,
  normalizeDateSpan,
  removeDashes,
  sortNumeric,
} from "./bounds.js";
export { scoreOne } from "./score.js";
export { calculateGlobalScore, getParameterValues } from "./algorithm.js";
export { PrioritizationV2 } from "./adapter.js";
