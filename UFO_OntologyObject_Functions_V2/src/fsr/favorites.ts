/**
 * FSR V2 — favorites pure logic.
 *
 * Replaces V1 `addAndupdateFSRFavs`, `removeAndupdateFSRFavs`, and the
 * read-side membership test inside `scenarioFSRMatch`. All three V1
 * versions had array-shape defects (positional indexing, sentinel `""`
 * seeds, `"-"` placeholder for undefined IDs); V2 keeps the boundary
 * narrow by accepting/returning plain `string[]` and pushing all
 * undefined-`idDossier` handling to the adapter.
 *
 * Pure: no Foundry imports.
 *
 * Behavioral contract (locked in during the FSR port design discussion):
 *   - `addFavorites`     — Set-based merge; re-adding an existing favorite is a NO-OP
 *                          (preserves original position; idempotent under retries).
 *   - `removeFavorites`  — filter out any id that appears in `idsToRemove`; missing ids
 *                          are silently skipped. Idempotent.
 *   - `isFavoriteOf`     — predicate used by `scenarioFSRMatch` to flag entries.
 *                          A missing `dossierId` (undefined) is never a favorite.
 */

// ─────────────────────────────────────────────────────────────────────
// TODO — fill in the three function bodies below.
//
// Each one should be ~3 lines. Keep them allocation-light: prefer
// `Array.from(new Set(...))`, `Array.prototype.filter`, etc. The tests
// in `test/fsr/favorites.test.ts` are the contract — run
// `npx vitest run test/fsr/favorites.test.ts` to check yourself.
//
// Edge cases the tests exercise:
//   addFavorites:
//     - current === undefined  →  return a fresh array of newIds (de-duped)
//     - newIds contains duplicates of existing favorites  →  no-op
//     - newIds contains duplicates of itself  →  de-dupe
//     - order:  existing favorites first, then newly-added in input order
//   removeFavorites:
//     - current === undefined  →  return []
//     - idsToRemove not present in current  →  current returned unchanged
//   isFavoriteOf:
//     - favorites === undefined  →  false
//     - dossierId === undefined  →  false
// ─────────────────────────────────────────────────────────────────────

export function addFavorites(
  current: readonly string[] | undefined,
  newIds: readonly string[],
): string[] {
  return Array.from(new Set([...(current ?? []), ...newIds]));
}

export function removeFavorites(
  current: readonly string[] | undefined,
  idsToRemove: readonly string[],
): string[] {
  const removeSet = new Set(idsToRemove);
  return (current ?? []).filter((id) => !removeSet.has(id));
}

export function isFavoriteOf(
  favorites: readonly string[] | undefined,
  dossierId: string | undefined,
): boolean {
  if (favorites === undefined) return false;
  if (dossierId === undefined) return false;
  return favorites.includes(dossierId);
}
