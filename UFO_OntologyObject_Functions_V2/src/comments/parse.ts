/**
 * Comments V2 — parsing shim.
 *
 * Translates between the V1 delimited-string encoding and the typed
 * `CommentEntry` struct. The V2 adapter calls `parseEntryComment` when
 * reading `Ufoentry.comments`, operates on a strongly-typed array, and
 * calls `toEntryComment` when writing back.
 *
 * When Phase 3 ontology re-shape lands and the field type changes from
 * `Array<String>` to `Array<st_comment_entry>`, the adapter drops the
 * parser and reads the struct directly; the pure-logic modules (views.ts,
 * etc.) continue to operate on `CommentEntry` unchanged.
 *
 * Three V1 string formats are supported:
 *
 *   "entry"  : "<timestamp>.<author_display>.<code>.<body>"
 *              Stored on Ufoentry.comments
 *   "team"   : "<millis>%*<dossier_id>%*<author>%*<code>%*<body>"
 *              Stored on Fsrteam.comments  — five-field, %* delimiter
 *   "linked" : "<source_dossier_id>.<millis>.<body>"
 *              Stored on Ufoentry.linkedComments — three-field
 *
 * Timestamps may be ISO-8601 OR epoch millis. We dispatch on whether the
 * timestamp field contains a "-" (ISO) or not (millis), matching the V1
 * `dateStr.includes("-")` check.
 */

import {
  COMMENT_CODES,
  type CommentCode,
  type CommentEntry,
  type LinkedCommentEntry,
} from "./types.js";

/** Find the n-th occurrence of `needle` in `haystack`. -1 if not present. */
function nthIndexOf(haystack: string, needle: string, n: number): number {
  let idx = -1;
  for (let i = 0; i < n; i++) {
    idx = haystack.indexOf(needle, idx + 1);
    if (idx === -1) return -1;
  }
  return idx;
}

/** Parse a timestamp that may be ISO-8601 or epoch millis. */
function parseTimestamp(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.includes("-")) {
    const ms = Date.parse(trimmed);
    return Number.isFinite(ms) ? ms : null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Type guard — checks a string is one of the known CommentCode values. */
function isCommentCode(s: string): s is CommentCode {
  return (COMMENT_CODES as readonly string[]).includes(s);
}

/**
 * Parse a per-entry comment string.
 * Returns `null` for malformed inputs so a single corrupt row cannot
 * poison a whole entry's view.
 */
export function parseEntryComment(raw: string): CommentEntry | null {
  if (!raw || raw.trim() === "") return null;
  const dot1 = nthIndexOf(raw, ".", 1);
  const dot2 = nthIndexOf(raw, ".", 2);
  const dot3 = nthIndexOf(raw, ".", 3);
  if (dot1 === -1 || dot2 === -1 || dot3 === -1) return null;

  const tsRaw = raw.substring(0, dot1);
  const author = raw.substring(dot1 + 1, dot2).trim();
  const codeRaw = raw.substring(dot2 + 1, dot3).trim();
  const body = raw.substring(dot3 + 1).trim();

  const ts = parseTimestamp(tsRaw);
  if (ts === null) return null;
  if (!isCommentCode(codeRaw)) return null;

  return {
    timestamp: ts,
    authorUuid: "",
    authorDisplay: author,
    code: codeRaw,
    body,
    isLinked: false,
    linkedMsnIds: [],
  };
}

/** Serialize a `CommentEntry` to the V1 per-entry string format. */
export function toEntryComment(c: CommentEntry): string {
  return `${c.timestamp}.${c.authorDisplay}.${c.code}.${c.body}`;
}

/** Parse a team-style comment from `Fsrteam.comments`. */
export function parseTeamComment(
  raw: string,
): (CommentEntry & { sourceDossierId: string }) | null {
  if (!raw || raw.trim() === "") return null;
  const fields = raw.split("%*");
  if (fields.length < 5) return null;
  const [tsRaw, dossierId, author, codeRaw, ...bodyParts] = fields;
  const ts = parseTimestamp(tsRaw);
  if (ts === null) return null;
  if (!isCommentCode(codeRaw.trim())) return null;
  return {
    timestamp: ts,
    authorUuid: "",
    authorDisplay: author.trim(),
    code: codeRaw.trim() as CommentCode,
    body: bodyParts.join("%*").trim(),
    isLinked: false,
    linkedMsnIds: [],
    sourceDossierId: dossierId.trim(),
  };
}

/** Serialize a `CommentEntry` to the V1 team-style `%*` format. */
export function toTeamComment(c: CommentEntry, sourceDossierId: string): string {
  return [
    c.timestamp,
    sourceDossierId,
    c.authorDisplay,
    c.code,
    c.body,
  ].join("%*");
}

/** Parse a per-entry linked-comment string. */
export function parseLinkedComment(raw: string): LinkedCommentEntry | null {
  if (!raw || raw.trim() === "") return null;
  const dot1 = nthIndexOf(raw, ".", 1);
  const dot2 = nthIndexOf(raw, ".", 2);
  if (dot1 === -1 || dot2 === -1) return null;
  // V1 expects the dossier id to fit in the first 10 chars; if not, bail.
  if (dot1 >= 10) return null;
  const dossierId = raw.substring(0, dot1);
  const tsRaw = raw.substring(dot1 + 1, dot2);
  const ts = parseTimestamp(tsRaw);
  if (ts === null) return null;
  return {
    timestamp: ts,
    sourceDossierId: dossierId,
    body: raw.substring(dot2 + 1).trim(),
  };
}

/** Serialize a comment for the per-entry linked-comment format. */
export function toLinkedComment(
  sourceDossierId: string,
  c: CommentEntry,
): string {
  return `${sourceDossierId}.${c.timestamp}.${c.body}`;
}

/** Resolve every UUID @-mention in a body via the user dictionary. */
export function resolveMentions(
  body: string,
  users: ReadonlyMap<string, string>,
): string {
  let out = body;
  for (const [uuid, display] of users) {
    if (out.includes(uuid)) out = out.replaceAll(uuid, display);
  }
  return out;
}
