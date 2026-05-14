/**
 * Reporting V2 — types and constants.
 *
 * Ports `UFO_OntologyObject_Functions/reportGenerator.ts` to the V2 layout.
 * The V1 module produces a daily HTML digest delivered as a `Notification`
 * to an `Fsrteam` operator group; the digest combines two streams:
 *
 *   1. Recent `Ufoescalation`s raised by FSRs in `team.ufofsrs`.
 *   2. Recent team-level comments stored on `Fsrteam.comments` (the same
 *      `%*`-delimited five-field encoding the Comments module already
 *      parses — we re-use `parseTeamComment`).
 *
 * Pure-logic files (`escalations.ts`, `comments.ts`, `render.ts`) never
 * touch `@foundry/*`. The adapter does the V1-column → clean-shape
 * conversion (notably stripping the `escalationRasisedDate` misspelling
 * that V2 stub §4.11 retains as a transitional V1 column).
 */

/**
 * Daily report look-back window. Spec §4.11 describes the report as a
 * "24-hour team escalation report", and the team-comment side of the V1
 * report already uses `now − 24h`. We pin the constant here so the
 * escalation side and the comment side share one window.
 */
export const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Clean projection of a `Ufoescalation` for pure-logic consumption.
 *
 * The adapter is responsible for sourcing each field — in particular,
 * `raisedAtMs` is read from the V1 column `escalationRasisedDate` (yes,
 * with the typo) and converted to epoch ms. Once the P3 ontology re-shape
 * renames the column, only the adapter touches the rename.
 */
export interface ReportEscalation {
  /** Epoch ms (start-of-day in V1; nullable when the date never got stamped). */
  raisedAtMs: number | undefined;
  /** Display name of the FSR who raised the escalation; may be padded. */
  user: string;
  /** `Internal` / `Customer` / `Parts` (free-text in V1; not validated here). */
  escalationType: string;
  /** Dossier the escalation refers to. */
  dossierId: string;
}
