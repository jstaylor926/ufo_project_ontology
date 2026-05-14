/**
 * FSR V2 — identity / lifecycle pure logic.
 *
 * Replaces the V1 `scanandDelete` inactivity comparison, which had two
 * defects: (a) it compared `lastLogIn - now` (always negative) so no FSR
 * was ever actually pruned, and (b) on `lastLogIn === undefined` it
 * silently stamped the row to `now`, extending the life of FSRs that may
 * actually have been long-inactive.
 *
 * V2 policy (from the FSR port design discussion):
 *   - `lastLogIn === undefined`  → not inactive (skip). We refuse to prune
 *     rows we have no signal on; freshly-provisioned FSRs are protected.
 *   - `lastLogIn` present        → inactive iff `now - lastLogIn > 1 year`.
 *
 * Pure: takes raw numbers (epoch ms). The adapter converts `Timestamp`s.
 */

import { INACTIVITY_THRESHOLD_MS } from "./types.js";

export function isInactive(
  nowMs: number,
  lastLogInMs: number | undefined,
): boolean {
  if (lastLogInMs === undefined) return false;
  return nowMs - lastLogInMs > INACTIVITY_THRESHOLD_MS;
}
