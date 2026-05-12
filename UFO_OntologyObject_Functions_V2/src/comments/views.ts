/**
 * Comments V2 — view layer.
 *
 * Pure functions that filter, count, and render `CommentEntry[]` for the
 * Workshop FSR view. Replaces the per-code V1 functions (`partsComments`,
 * `technicalComments`, `custSuppComments`, plus the three `mostRecent*`
 * variants) with a single dispatch.
 *
 * No Foundry imports — fully testable locally.
 */

import { resolveMentions } from "./parse.js";
import {
  type CommentCode,
  type CommentEntry,
  type CountsByCode,
  type LinkedCommentEntry,
  EMPTY_COUNTS,
} from "./types.js";

/** Filter by triage bucket. */
export function filterByCode(
  comments: readonly CommentEntry[],
  code: CommentCode,
): CommentEntry[] {
  return comments.filter((c) => c.code === code);
}

/** Most recent item (by timestamp) — undefined if the input is empty. */
export function mostRecent<T extends { timestamp: number }>(
  items: readonly T[],
): T | undefined {
  let best: T | undefined;
  for (const it of items) {
    if (best === undefined || it.timestamp > best.timestamp) best = it;
  }
  return best;
}

/**
 * Bucketed counts of comments + linked comments since (optionally) a
 * threshold timestamp. Used by the Workshop breakdown column.
 */
export function countByCode(
  comments: readonly CommentEntry[],
  linkedComments: readonly LinkedCommentEntry[],
  currentDossierId: string,
  since?: number,
): CountsByCode {
  const out: CountsByCode = { ...EMPTY_COUNTS };
  for (const c of comments) {
    if (since !== undefined && c.timestamp < since) continue;
    if (c.code === "Parts") out.parts++;
    else if (c.code === "Technical") out.technical++;
    else if (c.code === "Customer Support") out.customerSupport++;
  }
  for (const lc of linkedComments) {
    if (lc.sourceDossierId === currentDossierId) continue;
    if (since !== undefined && lc.timestamp < since) continue;
    out.linked++;
  }
  return out;
}

/** Cheap text summary of a counts payload, matching the V1 string shape. */
export function summarizeCounts(counts: Readonly<CountsByCode>): string {
  const empty =
    counts.parts === 0 &&
    counts.technical === 0 &&
    counts.customerSupport === 0 &&
    counts.linked === 0;
  if (empty) return "";
  return ` Parts: ${counts.parts} \n Tech: ${counts.technical} \n CS: ${counts.customerSupport} \n Link: ${counts.linked}`;
}

/** Options for the markdown renderer. */
export interface RenderOptions {
  /** Comments with `timestamp >= newSince` get a `==` highlight. */
  newSince?: number;
  /** If supplied, every UUID @-mention in the body is replaced. */
  users?: ReadonlyMap<string, string>;
  /** If true, sort newest-first before rendering. */
  sortDescending?: boolean;
}

/** Re-implementation of the V1 `commentStringFormatter`. */
function formatBody(body: string): string {
  const lines = body
    .replace(/(?:\r\n|\r|\n)+/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  return " \n" + lines.map((l) => ` ##### *${l}*\n`).join("");
}

/**
 * Render a set of comments as the markdown the Workshop view expects.
 * Mirrors the V1 `partsComments` / `technicalComments` / `custSuppComments`
 * output exactly, modulo the missing "..." double-quote noise that V1
 * sometimes carried.
 */
export function renderCommentMarkdown(
  comments: readonly CommentEntry[],
  opts: RenderOptions = {},
): string {
  const work = opts.sortDescending
    ? [...comments].sort((a, b) => b.timestamp - a.timestamp)
    : comments;
  let out = "";
  for (const c of work) {
    const isNew =
      opts.newSince !== undefined && c.timestamp >= opts.newSince;
    const flag = isNew ? "==" : "";
    const dateStr = new Date(c.timestamp).toLocaleString();
    const body = opts.users ? resolveMentions(c.body, opts.users) : c.body;
    out += `#### ${flag}${dateStr}-${c.authorDisplay}${flag}${formatBody(body)}  \n  \n`;
  }
  return out;
}

/**
 * Render linked comments for a given entry. Only comments that did not
 * originate on `currentDossierId` are included — V1 had the same rule.
 */
export function renderLinkedMarkdown(
  linkedComments: readonly LinkedCommentEntry[],
  currentDossierId: string,
  opts: RenderOptions = {},
): string {
  const filtered = linkedComments.filter(
    (lc) => lc.sourceDossierId !== currentDossierId,
  );
  const work = opts.sortDescending
    ? [...filtered].sort((a, b) => b.timestamp - a.timestamp)
    : filtered;
  let out = "";
  for (const lc of work) {
    const isNew =
      opts.newSince !== undefined && lc.timestamp >= opts.newSince;
    const flag = isNew ? "==" : "";
    const dateStr = new Date(lc.timestamp).toLocaleString();
    const body = opts.users ? resolveMentions(lc.body, opts.users) : lc.body;
    out += `#### ${flag}${dateStr}-${lc.sourceDossierId}${flag}${formatBody(body)}  \n  \n`;
  }
  return out;
}
