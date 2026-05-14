/**
 * Restoration V2 — pure array helpers.
 *
 * Replaces the per-field repeated sort-and-compare loops in V1
 * `Restoration.filterChange` (which copy-pasted the same 3-line dance 9
 * times), plus the small `returnRestoredList` / `returnRestoredList_number`
 * helpers.
 *
 * No Foundry imports.
 */

/**
 * Multiset equality on string arrays. `undefined` is treated as empty.
 *
 * Two arrays are equal iff they have the same length AND the same
 * element multiset (sort-then-compare). Duplicates matter:
 * `["A", "A", "B"]` is NOT equal to `["A", "B", "B"]`. This matches the
 * V1 sort-then-every behavior.
 */
export function arraysEqualUnordered(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean {
  const x = [...(a ?? [])].sort();
  const y = [...(b ?? [])].sort();
  if (x.length !== y.length) return false;
  return x.every((v, i) => v === y[i]);
}

/**
 * Defensive null-coalesce passthrough. Mirrors V1
 * `returnRestoredList` — its only job is to convert a possibly-undefined
 * Workshop filter snapshot into a guaranteed array.
 */
export function ensureStringArray(list: readonly string[] | undefined): string[] {
  return [...(list ?? [])];
}

/**
 * `parseInt` over an array. NaN entries from unparseable input are
 * preserved (matching V1) so positional indexing downstream is
 * unaffected. If callers need filtering, do it at the call site.
 */
export function toIntegerArray(list: readonly string[]): number[] {
  return list.map((s) => parseInt(s, 10));
}

/** `toString` over a mixed string/number array. */
export function toStringArray(arr: readonly (string | number)[]): string[] {
  return arr.map((v) => String(v));
}
