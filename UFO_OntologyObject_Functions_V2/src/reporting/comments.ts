/**
 * Reporting V2 — team-comment grouping for the daily digest.
 *
 * Replaces V1 `reportGenerator.getComments`. V1 inlined the `%*`-split
 * parser, the 24-hour filter, and the dossier-id grouping into one
 * 20-line method; V2 keeps the same shape but reuses the canonical
 * `parseTeamComment` from the Comments module so the team-comment
 * format has a single source of truth.
 *
 * Output is a `Map<dossierId, formattedLine[]>` — preserves V1's
 * insertion-order grouping so the rendered HTML lists dossiers in the
 * order their first comment arrived (matching V1).
 */

import { parseTeamComment } from "../comments/parse.js";
import { REPORT_WINDOW_MS } from "./types.js";

/**
 * Parse `team.comments`, drop entries older than `nowMs − 24h`, and
 * group the survivors by their source dossier id.
 *
 * Each formatted line follows V1's shape:
 *   `"<author> (<code>): <body>"`
 *
 * Malformed rows are silently skipped (per `parseTeamComment`'s null
 * return contract). `undefined` input is treated as no comments.
 */
export function groupRecentTeamComments(
  rawComments: readonly string[] | undefined,
  nowMs: number,
): Map<string, string[]> {
  const cutoff = nowMs - REPORT_WINDOW_MS;
  const out = new Map<string, string[]>();
  for (const raw of rawComments ?? []) {
    const parsed = parseTeamComment(raw);
    if (parsed === null) continue;
    if (parsed.timestamp <= cutoff) continue;
    const line = `${parsed.authorDisplay} (${parsed.code}): ${parsed.body}`;
    const existing = out.get(parsed.sourceDossierId);
    if (existing === undefined) {
      out.set(parsed.sourceDossierId, [line]);
    } else {
      existing.push(line);
    }
  }
  return out;
}
