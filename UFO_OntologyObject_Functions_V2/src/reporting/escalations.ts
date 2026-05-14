/**
 * Reporting V2 — escalation filtering for the daily digest.
 *
 * V1 (`reportGenerator.reportDriver`) filtered with:
 *
 *   escalations.filter(f =>
 *     f.escalationRasisedDate !== undefined
 *     && f.escalationRasisedDate >= LocalDate.now())
 *
 * Read literally, that keeps escalations whose raised-date is **today or
 * later** — which (a) drops anything raised yesterday afternoon and (b)
 * makes no sense for a back-looking digest. Spec §4.11 names this the
 * "24-hour team escalation report", and the comment side of the same
 * report uses `now − 24h`.
 *
 * V2 aligns to the spec: the escalation side and the comment side share
 * `REPORT_WINDOW_MS`. This is a quiet bug-fix relative to V1 — escalations
 * raised between yesterday midnight and the report fire time now make it
 * into the email instead of being silently dropped at midnight rollover.
 */

import { REPORT_WINDOW_MS, type ReportEscalation } from "./types.js";

/**
 * Return the subset of `escalations` that belongs in today's digest.
 *
 * - `escalations`: already-flattened across `team.ufofsrs[*].ufoescalations`.
 *   `raisedAtMs` is undefined when the V1 column was null; those are dropped
 *   (mirrors V1's `f.escalationRasisedDate !== undefined` guard).
 * - `nowMs`: report fire time, injected so tests are deterministic — same
 *   pattern the Comments adapter uses.
 *
 * Window is `(nowMs − 24h, nowMs]`. The lower bound is exclusive — the V1
 * filter used `>=` against a `LocalDate`, but with a millisecond resolution
 * "more than 24h ago" reads more naturally as a strict inequality, and the
 * boundary case is vanishingly rare.
 */
export function recentEscalations(
  escalations: readonly ReportEscalation[],
  nowMs: number,
): ReportEscalation[] {
  const cutoff = nowMs - REPORT_WINDOW_MS;
  return escalations.filter(
    (e) => e.raisedAtMs !== undefined && e.raisedAtMs > cutoff,
  );
}

