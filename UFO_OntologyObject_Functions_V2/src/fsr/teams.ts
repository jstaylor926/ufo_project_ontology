/**
 * FSR V2 — team-membership pure logic.
 *
 * Replaces V1 `fsrTeam.setTeamMembers`. V1 had two defects:
 *   1. The filter callback used a brace block with no `return`, so every
 *      FSR was dropped and `team.fsrs` was always written as `[]`.
 *   2. V1 referenced `f.fsrteam` (column rename) and `f.name` (the
 *      Title), while the V2 ontology spec §4.10 specifies `members` as
 *      `Array<UfoFsr.userId>`. The port uses the V2 names.
 *
 * Pure: takes a plain FSR shape, returns a plain `string[]`.
 */

/** Minimum FSR projection the team-membership pure logic needs. */
export interface FsrLite {
  userId?: string;
  operatorCode?: string;
}

/**
 * Return the `userId`s of FSRs whose `operatorCode` matches the team's.
 *
 * - FSRs with an `undefined` `operatorCode` are skipped (no match signal).
 * - FSRs with an `undefined` `userId` are skipped (can't write what isn't
 *   identifiable).
 * - Result order follows input order; duplicates are preserved if present
 *   (the FSR registry should not contain duplicate `userId`s, but this
 *   function doesn't enforce that — the adapter feeds it whatever
 *   `Objects.search().ufoFsr().all()` returns).
 */
export function selectTeamMembers(
  fsrs: readonly FsrLite[],
  operatorCode: string | undefined,
): string[] {
  if (operatorCode === undefined) return [];
  const out: string[] = [];
  for (const f of fsrs) {
    if (f.operatorCode === operatorCode && f.userId !== undefined) {
      out.push(f.userId);
    }
  }
  return out;
}
