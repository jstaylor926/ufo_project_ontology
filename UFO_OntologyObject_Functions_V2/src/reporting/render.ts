/**
 * Reporting V2 — HTML rendering for the daily digest.
 *
 * Pure functions that produce the exact HTML envelope V1 emits, so the
 * resulting email is byte-for-byte (modulo whitespace) compatible with
 * the V1 output. Mail clients render the body as HTML; we deliberately
 * match V1's lack of escaping because the inputs at this point are
 * already-sanitized FSR-authored team annotations and Workshop-issued
 * escalation rows — same trust boundary V1 has, no new surface added.
 */

import type { ReportEscalation } from "./types.js";

/** V1 `<ul>` envelope with V1's inline list-style attributes. */
const ESCALATION_LIST_OPEN =
  '<ul style="list-style-position: inside; padding-left: 0; margin-left: 0;">';
const ESCALATION_LIST_CLOSE = "</ul>";

/**
 * Render the escalation `<li>` list. Order is preserved from the input.
 * V1 trims the user display name but renders the other fields raw; we
 * keep that behavior.
 */
export function renderEscalationList(
  escalations: readonly ReportEscalation[],
): string {
  let out = ESCALATION_LIST_OPEN;
  for (const esc of escalations) {
    out +=
      `<li> <i>${esc.user.trim()}</i> requested a(n) ${esc.escalationType}` +
      ` escalation on <b> Dossier ${esc.dossierId}</b> </li>`;
  }
  out += ESCALATION_LIST_CLOSE;
  return out;
}

/**
 * Replaces V1 `formatComments`. Renders a borderless `<table>` of
 * per-dossier comment lists. Map insertion order drives row order, which
 * matches V1's `Map.entries()` iteration.
 */
export function renderCommentDigest(byDossier: ReadonlyMap<string, readonly string[]>): string {
  let out = "<div><table style='border-collapse: collapse;'><tbody>";
  for (const [dossierId, lines] of byDossier) {
    out += "<tr><td>";
    out += `<h2>${dossierId}</h2>`;
    out += "<ul>";
    for (const line of lines) {
      out += `<li>${line}</li>`;
    }
    out += "</ul>";
    out += "</td></tr>";
  }
  out += "</tbody></table></div>";
  return out;
}

/**
 * Stitches the escalation list and the comment digest into the V1 body
 * shape: escalations first (one `<ul>`), comments second (one `<table>`).
 */
export function renderReportBody(
  escalations: readonly ReportEscalation[],
  byDossier: ReadonlyMap<string, readonly string[]>,
): string {
  return renderEscalationList(escalations) + renderCommentDigest(byDossier);
}
