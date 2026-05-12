/**
 * Comments V2 — types.
 *
 * Mirrors the `st_comment_entry` struct type proposed in
 * "UFO V2 Phase 3 Ontology Proposal", §4.1. When the ontology re-shape
 * lands (Phase 3), `Ufoentry.comments` becomes `Array<st_comment_entry>`
 * natively and these types describe its element directly. Until then,
 * `parse.ts` converts between the V1 delimited-string encoding and the
 * struct.
 *
 * No Foundry imports — these types are fully testable locally.
 */

export const COMMENT_CODES = [
  "Parts",
  "Technical",
  "Customer Support",
] as const;

export type CommentCode = (typeof COMMENT_CODES)[number];

/** Convenience for views that bucket linked comments alongside coded ones. */
export type ViewCode = CommentCode | "Linked";

/** A single comment posted by an FSR on a dossier. */
export interface CommentEntry {
  /** UTC epoch milliseconds when the comment was committed. */
  timestamp: number;
  /** FSR's UUID. Empty string when read from a legacy V1 row that never carried one. */
  authorUuid: string;
  /** Cached display name at write time. */
  authorDisplay: string;
  /** Triage bucket the comment was filed under. */
  code: CommentCode;
  /** Free-form body. May contain UUID @-mentions that still need resolution. */
  body: string;
  /** True if the comment was broadcast to MSN-linked sibling dossiers. */
  isLinked: boolean;
  /** If linked, the set of MSNs the broadcast targeted. */
  linkedMsnIds: number[];
}

/** A linked comment as observed on a recipient entry. */
export interface LinkedCommentEntry {
  timestamp: number;
  /** dossier_id that originated the comment (not the entry receiving it). */
  sourceDossierId: string;
  body: string;
}

/** Bucketed counts used by the Workshop "comment breakdown" function. */
export interface CountsByCode {
  parts: number;
  technical: number;
  customerSupport: number;
  linked: number;
}

export const EMPTY_COUNTS: Readonly<CountsByCode> = Object.freeze({
  parts: 0,
  technical: 0,
  customerSupport: 0,
  linked: 0,
});
