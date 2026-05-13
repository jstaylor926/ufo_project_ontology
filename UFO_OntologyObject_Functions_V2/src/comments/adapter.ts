/**
 * Comments V2 — Foundry adapter.
 *
 * Decorated entry points that the ontology runtime invokes. Each adapter
 * method is a thin shim: it pulls strings off the V1 storage shape,
 * parses them into `CommentEntry`, defers to pure logic in `views.ts`,
 * and serializes back on writes. Once the Phase 3 ontology re-shape
 * lands, the parse/serialize calls disappear — `entry.comments` already
 * holds `CommentEntry[]` natively. The pure logic does not change.
 *
 * The class is purposely small. Anything that can be unit-tested without
 * Foundry lives in `parse.ts` / `views.ts`.
 *
 * Phase-4 function-backed property bindings (Ontology Spec §7.3). Each
 * `Ufoentry.*Md` property binds to the like-named function below; the
 * `commentsByCode` / `mostRecentByCode` dispatch methods remain exposed
 * for Workshop widgets that pick the code at runtime.
 *
 *   Ufoentry property                  ←  function
 *   commentBreakdownMd                    commentBreakdown
 *   commentsTechnicalMd                   commentsTechnicalMd
 *   commentsPartsMd                       commentsPartsMd
 *   commentsCustSuppMd                    commentsCustSuppMd
 *   mostRecentTechnicalCommentMd          mostRecentTechnicalCommentMd
 *   mostRecentPartsCommentMd              mostRecentPartsCommentMd
 *   mostRecentCustSuppCommentMd           mostRecentCustSuppCommentMd
 *   linkedCommentsMd                      linkedCommentsMarkdown
 *   mostRecentLinkedCommentMd             mostRecentLinkedComment
 */

import {
  Edits,
  Function,
  FunctionsMap,
  OntologyEditFunction,
  Timestamp,
} from "@foundry/functions-api";
import {
  Ufoentry,
  UfoFsr,
  type ObjectSet,
} from "@foundry/ontology-api";
import {
  parseEntryComment,
  parseLinkedComment,
  resolveMentions,
  toEntryComment,
  toLinkedComment,
} from "./parse.js";
import {
  filterByCode,
  mostRecent,
  renderCommentMarkdown,
  renderLinkedMarkdown,
  countByCode,
  summarizeCounts,
} from "./views.js";
import { COMMENT_USERS } from "./dictionary.js";
import type { CommentCode, CommentEntry, LinkedCommentEntry } from "./types.js";

function readEntryComments(entry: Ufoentry): CommentEntry[] {
  return (entry.comments ?? [])
    .map(parseEntryComment)
    .filter((c): c is CommentEntry => c !== null);
}

function readLinkedComments(entry: Ufoentry): LinkedCommentEntry[] {
  return (entry.linkedComments ?? [])
    .map(parseLinkedComment)
    .filter((lc): lc is LinkedCommentEntry => lc !== null);
}

function sinceFrom(fsr: UfoFsr): number | undefined {
  return fsr.lastLogIn?.valueOf();
}

export class CommentsV2 {
  /**
   * Replaces V1 `newCommentBreakdownhelper`. Maps every entry to a
   * `Parts: N / Tech: N / CS: N / Link: N` summary, suppressed when all
   * counts are zero. Bound to `Ufoentry.commentBreakdownMd`.
   */
  @Function()
  public commentBreakdown(
    entries: ObjectSet<Ufoentry>,
    fsr: UfoFsr,
  ): FunctionsMap<Ufoentry, string> {
    const since = sinceFrom(fsr);
    const out = new FunctionsMap<Ufoentry, string>();
    for (const e of entries.all()) {
      const counts = countByCode(
        readEntryComments(e),
        readLinkedComments(e),
        e.idDossier ?? "",
        since,
      );
      out.set(e, summarizeCounts(counts));
    }
    return out;
  }

  /**
   * Replaces V1 `partsComments` / `technicalComments` / `custSuppComments`.
   * One dispatch instead of three near-identical functions.
   *
   * Returns a per-entry map so the result is FBP-shaped. The three
   * `commentsTechnicalMd` / `commentsPartsMd` / `commentsCustSuppMd`
   * wrappers below are the canonical bind targets; this dispatch stays
   * exposed for Workshop widgets that pick the code at runtime.
   */
  @Function()
  public commentsByCode(
    entries: ObjectSet<Ufoentry>,
    code: CommentCode,
    fsr: UfoFsr,
  ): FunctionsMap<Ufoentry, string> {
    const since = sinceFrom(fsr);
    const out = new FunctionsMap<Ufoentry, string>();
    for (const e of entries.all()) {
      const filtered = filterByCode(readEntryComments(e), code);
      out.set(
        e,
        renderCommentMarkdown(filtered, {
          newSince: since,
          users: COMMENT_USERS,
        }),
      );
    }
    return out;
  }

  /**
   * Replaces V1 `mostRecentPartsComment` / `mostRecentTechnicalComment` /
   * `mostRecentCustSuppComments`. One dispatch instead of three.
   * The three `mostRecent*CommentMd` wrappers below are the canonical
   * FBP bind targets; this dispatch stays exposed for runtime code
   * selection.
   */
  @Function()
  public mostRecentByCode(
    entries: ObjectSet<Ufoentry>,
    code: CommentCode,
  ): FunctionsMap<Ufoentry, string | undefined> {
    const out = new FunctionsMap<Ufoentry, string | undefined>();
    for (const e of entries.all()) {
      const c = mostRecent(filterByCode(readEntryComments(e), code));
      out.set(e, c?.body);
    }
    return out;
  }

  /**
   * Replaces V1 `linkedComments` markdown renderer. Bound to
   * `Ufoentry.linkedCommentsMd`.
   */
  @Function()
  public linkedCommentsMarkdown(
    entries: ObjectSet<Ufoentry>,
    fsr: UfoFsr,
  ): FunctionsMap<Ufoentry, string> {
    const since = sinceFrom(fsr);
    const out = new FunctionsMap<Ufoentry, string>();
    for (const e of entries.all()) {
      out.set(
        e,
        renderLinkedMarkdown(readLinkedComments(e), e.idDossier ?? "", {
          newSince: since,
          users: COMMENT_USERS,
        }),
      );
    }
    return out;
  }

  /** Replaces V1 `mostRecentLinkedComment`. Bound to `Ufoentry.mostRecentLinkedCommentMd`. */
  @Function()
  public mostRecentLinkedComment(
    entries: ObjectSet<Ufoentry>,
  ): FunctionsMap<Ufoentry, string | undefined> {
    const out = new FunctionsMap<Ufoentry, string | undefined>();
    for (const e of entries.all()) {
      const linkedFromOthers = readLinkedComments(e).filter(
        (lc) => lc.sourceDossierId !== (e.idDossier ?? ""),
      );
      const recent = mostRecent(linkedFromOthers);
      out.set(e, recent?.body);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Per-FBP wrappers — canonical bind targets for the §7.3 properties.
  // Each is a thin pass-through that fixes the `code` parameter so the
  // Foundry binding doesn't need to thread per-binding constants.

  /** Bound to `Ufoentry.commentsTechnicalMd`. */
  @Function()
  public commentsTechnicalMd(
    entries: ObjectSet<Ufoentry>,
    fsr: UfoFsr,
  ): FunctionsMap<Ufoentry, string> {
    return this.commentsByCode(entries, "Technical", fsr);
  }

  /** Bound to `Ufoentry.commentsPartsMd`. */
  @Function()
  public commentsPartsMd(
    entries: ObjectSet<Ufoentry>,
    fsr: UfoFsr,
  ): FunctionsMap<Ufoentry, string> {
    return this.commentsByCode(entries, "Parts", fsr);
  }

  /** Bound to `Ufoentry.commentsCustSuppMd`. */
  @Function()
  public commentsCustSuppMd(
    entries: ObjectSet<Ufoentry>,
    fsr: UfoFsr,
  ): FunctionsMap<Ufoentry, string> {
    return this.commentsByCode(entries, "Customer Support", fsr);
  }

  /** Bound to `Ufoentry.mostRecentTechnicalCommentMd`. */
  @Function()
  public mostRecentTechnicalCommentMd(
    entries: ObjectSet<Ufoentry>,
  ): FunctionsMap<Ufoentry, string | undefined> {
    return this.mostRecentByCode(entries, "Technical");
  }

  /** Bound to `Ufoentry.mostRecentPartsCommentMd`. */
  @Function()
  public mostRecentPartsCommentMd(
    entries: ObjectSet<Ufoentry>,
  ): FunctionsMap<Ufoentry, string | undefined> {
    return this.mostRecentByCode(entries, "Parts");
  }

  /** Bound to `Ufoentry.mostRecentCustSuppCommentMd`. */
  @Function()
  public mostRecentCustSuppCommentMd(
    entries: ObjectSet<Ufoentry>,
  ): FunctionsMap<Ufoentry, string | undefined> {
    return this.mostRecentByCode(entries, "Customer Support");
  }

  /**
   * Replaces V1 `addCommentstoUFOEntry`.
   *
   * Writes both to the originating entry's `comments` array and, when
   * `link === true`, to every supplied linked dossier's `linkedComments`
   * array. Storage remains V1 string-encoded so the existing V1 ontology
   * keeps reading correctly during the transition.
   *
   * Validation per Ontology Spec §6.1: `code` ∈ COMMENT_CODES (enforced by
   * the type system at the action boundary); `body` must be non-empty;
   * `entry` must exist.
   */
  @OntologyEditFunction()
  @Edits(Ufoentry)
  public addComment(
    entry: Ufoentry,
    body: string,
    code: CommentCode,
    authorDisplay: string,
    link: boolean,
    linkedEntries: ObjectSet<Ufoentry>,
  ): void {
    if (entry == null) {
      throw new Error("addComment: entry is required");
    }
    if (body == null || body.trim() === "") {
      throw new Error("addComment: body must be non-empty");
    }

    const draft: CommentEntry = {
      timestamp: Timestamp.now().valueOf(),
      authorUuid: "",
      authorDisplay,
      code,
      body: resolveMentions(body, COMMENT_USERS),
      isLinked: link,
      linkedMsnIds: [],
    };

    entry.comments = [...(entry.comments ?? []), toEntryComment(draft)];

    // Stamp last-* timestamps to drive Workshop "what changed since I
    // last looked" affordances.
    const ts = Timestamp.now();
    if (code === "Parts") entry.lastPartsComment = ts;
    else if (code === "Technical") entry.lastTechComment = ts;
    else if (code === "Customer Support") entry.lastCustComment = ts;

    if (!link) return;
    const linkedRaw = toLinkedComment(entry.idDossier ?? "", draft);
    for (const le of linkedEntries.all()) {
      le.linkedComments = [...(le.linkedComments ?? []), linkedRaw];
    }
  }

  /**
   * Replaces V1 `Misc.commentFlag`. V1 was a toggle taking an ObjectSet;
   * V2 is an explicit per-FSR setter so the action is idempotent under
   * retries (per Ontology Spec §6.1).
   */
  @OntologyEditFunction()
  @Edits(UfoFsr)
  public setCommentFlag(fsr: UfoFsr, value: boolean): void {
    if (fsr == null) {
      throw new Error("setCommentFlag: fsr is required");
    }
    fsr.postCommentFlag = value;
  }
}
