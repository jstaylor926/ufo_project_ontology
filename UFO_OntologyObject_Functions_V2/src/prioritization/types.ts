/**
 * Prioritization V2 — types.
 *
 * Mirrors the V2 `PriorityAlgorithm` shape declared in
 * `src/types/foundry-stubs.ts` (and the corresponding ontology object).
 * V1's 60+ flat columns (`priorityParameter1..10`, `priPa1L1..5`,
 * `spanBool1..10`) collapse to a single `parameters: ParameterEntry[]`
 * array on `PriorityAlgorithm`. Position in the array preserves V1's
 * arithmetic-series weighting — index 0 is most important, index n-1 least.
 *
 *   parameters: [
 *     { key: "highest_message_urgency", isSpan: false, tiers: [] },
 *     { key: "operator_code_icao",      isSpan: false, tiers: ["AAL","DAL","JBU","ASA","FFT"] },
 *     { key: "aircraft_flight_hours",   isSpan: true,  tiers: ["24000","12000"] },
 *     ...
 *   ]
 *
 * The pure layer mirrors this with `PureParameterEntry` so vitest doesn't
 * need to construct the Foundry class. Field names match the Foundry stub
 * exactly so the adapter can pass entries through without remapping.
 *
 * No Foundry imports — fully testable locally.
 */

/**
 * Pure-layer mirror of `foundry-stubs.ParameterEntry`. Identical fields;
 * the duplicate type lets tests construct entries without importing the
 * Foundry stub.
 */
export interface PureParameterEntry {
  /** V2 parameter key, e.g. `"operator_code_icao"`. */
  key: string;
  /**
   * True iff this slot scores against dynamic min/max bounds computed
   * from the entry set. False = static tier-based scoring using `tiers`.
   * For `date`-strategy parameters, `isSpan` toggles between span-mode and
   * block-mode date scoring (V1 parity).
   */
  isSpan: boolean;
  /**
   * Tier values:
   *   - exactMatch / keyword: ranked enum (index 0 highest), up to V1's 5 entries.
   *   - span / date:          numeric bounds; when `isSpan` is true the
   *                           adapter fills these from min/max of the entry set.
   *   - binary:               single value at index 0; the "100 if matches" target.
   *
   * The literal "-" placeholder from V1 is preserved on read but stripped
   * inside `bounds.ts::removeDashes` before scoring math runs.
   */
  tiers: ReadonlyArray<string>;
}

/**
 * Materialized scoring configuration consumed by the pure algorithm.
 *
 * The adapter resolves the active `PriorityAlgorithm` (`mainConfigFlag === 1`),
 * fills span bounds from the entry set, and passes this struct down. The
 * algorithm layer never re-queries Foundry — keeps `algorithm.ts` synchronous
 * and unit-testable.
 */
export interface PriorityAlgorithmConfig {
  /** Stable algorithm identifier — typically "default" for the singleton. */
  algorithmId: string;
  /**
   * Ordered parameter slots. Position drives weight: index 0 is most
   * important. Empty array → every entry scores 0 (modulo the SBC bump).
   */
  parameters: ReadonlyArray<PureParameterEntry>;
}

/**
 * Scoring strategy classification for a single parameter. V1 derived this
 * implicitly from membership in five arrays (`exact_Matches`, `spans`,
 * `dates`, `binaryMatches`, `keywords`) plus five hardcoded specials.
 * V2 makes it a typed enum so unknown parameters fail loud rather than
 * silently scoring zero.
 */
export type ScoringStrategy =
  | "exactMatch"     // ranked enum membership, e.g. operator_code_icao
  | "span"           // numeric range, scored via spanOrBlock
  | "date"           // ISO-string date, normalized to days-since-now then spanned
  | "binary"         // boolean property; first tier matches → 100, else 0
  | "keyword"        // substring scan, e.g. dossier_title
  | "priority"       // hardcoded: Amber=50, Red=100
  | "messageUrgency" // hardcoded: Regular/Critical/High/AOG
  | "aircraftStatus" // hardcoded: AOG/Heavy Maintenance WSP/Visit
  | "escalations"    // hardcoded: count × 33
  | "trStatus";      // hardcoded: 8-step status ladder

/**
 * The key-value pair the scorer sees for a single parameter on a single
 * entry. `value` is the entry's reading flattened to a string (or undefined
 * when the entry has no value for the parameter). Mirrors V1's `kvArr`
 * shape in `getPriorityValsForOneEntry`.
 */
export interface ParameterValue {
  /** V2 parameter key, e.g. "operator_code_icao". */
  key: string;
  /** Stringified property reading from the entry, or undefined. */
  value: string | undefined;
}
