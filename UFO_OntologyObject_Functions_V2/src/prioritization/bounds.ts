/**
 * Prioritization V2 — bounds and span scoring.
 *
 * Pure numeric helpers extracted from V1 `index.ts`:
 *   - `isoStringtoDaysSince`         → `daysSince`     (injectable clock)
 *   - `spanorBlock`                  → `spanOrBlock`
 *   - `sort` (numeric)               → `sortNumeric`
 *   - `removeDashesAndCondense`      → `removeDashes`
 *
 * Behavior is byte-for-byte parity with V1 — the test suite documents the
 * arithmetic. The one structural change is the clock injection: V1 calls
 * `LocalDate.now()` (a Foundry symbol) directly. V2 takes a `now?: Date`
 * argument so vitest can pin time without monkey-patching globals — same
 * approach the Comments parser uses for fallback timestamps.
 *
 * No Foundry imports.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Days between today and the given ISO date string. Positive = future,
 * negative = past. Matches V1 `isoStringtoDaysSince` semantics: takes the
 * raw millisecond difference and divides by ms/day with no rounding, so
 * sub-day fractions survive into the spanOrBlock math.
 *
 * @param isoString  Any string parseable by `Date`.
 * @param now        Reference clock — defaults to `new Date()`. Pin in tests.
 */
export function daysSince(isoString: string, now: Date = new Date()): number {
  const target = new Date(isoString).valueOf();
  return (target - now.valueOf()) / MS_PER_DAY;
}

/**
 * Strip dash placeholders from a tier array and condense gaps.
 *
 * V1 used the literal string "-" to mark empty tier slots in
 * `priPa{N}L{1..5}` columns. This filter is applied before sorting bounds
 * for span scoring.
 */
export function removeDashes(arr: ReadonlyArray<string>): string[] {
  const out: string[] = [];
  for (const item of arr) {
    if (item !== "-") out.push(item);
  }
  return out;
}

/**
 * Parse-then-sort numeric tier values. Descending by default so that
 * `bounds[0]` is `max` and `bounds[1]` is `min` for span math.
 */
export function sortNumeric(
  arr: ReadonlyArray<string>,
  descending: boolean,
): number[] {
  const out = arr.map((s) => parseInt(s, 10));
  out.sort(descending ? (a, b) => b - a : (a, b) => a - b);
  return out;
}

/**
 * Span/block scoring helper.
 *
 *   spanMode=true  (`span`)  — linear interpolation: value→0 at min, value→100 at max,
 *                              clipped at both ends.
 *   spanMode=false (`block`) — bucket scoring: count how many tier thresholds the
 *                              value falls below; score = 100 − (index × 100/N).
 *
 * V1 dashed-out tiers are stripped via `removeDashes` first. Numeric parse
 * uses `parseInt` (base 10) to match V1; non-numeric inputs become NaN and
 * produce 0 in span mode (since NaN <= min is false and NaN >= max is false).
 *
 * @param value      The entry's reading, as a string.
 * @param bounds     Tier values (mixed in V1: dashes are stripped here).
 * @param spanMode   true for span (linear), false for block (bucket).
 */
export function spanOrBlock(
  value: string,
  bounds: ReadonlyArray<string>,
  spanMode: boolean,
): number {
  const cleaned = removeDashes(bounds);
  const sorted = sortNumeric(cleaned, true);
  const val = parseInt(value, 10);

  if (spanMode) {
    const max = sorted[0];
    const min = sorted[1];
    if (val <= min) return 0;
    if (val >= max) return 100;
    const span = max - min;
    const normalized = val - min;
    return (normalized / span) * 100;
  }

  let index = 0;
  let matched = false;
  for (let i = 0; i < sorted.length; i++) {
    if (val <= sorted[i]) {
      index = i;
      matched = true;
      break;
    }
  }
  if (!matched) index = sorted.length;
  return 100 - index * (100 / sorted.length);
}

/**
 * Normalize a date-span tier to non-negative days for `spanOrBlock`.
 *
 * V1 inlined this in `calculatePropertyScore`: when the min bound is
 * negative (i.e., the span reaches into the past), the value is reflected
 * so that the *earliest* date scores highest and the *latest* lowest. Example:
 *   tier ["7", "-365"] with days = -200 → range=372, days'=165, score≈44.4
 *
 * Returns the (value, [maxStr, minStr]) pair ready for spanOrBlock(spanMode=true).
 */
export function normalizeDateSpan(
  days: number,
  max: number,
  min: number,
): { value: string; bounds: [string, string] } {
  if (min < 0) {
    const range = max - min;
    const reflected = range - (days - min);
    return { value: reflected.toString(), bounds: [range.toString(), "0"] };
  }
  return { value: days.toString(), bounds: [max.toString(), min.toString()] };
}
