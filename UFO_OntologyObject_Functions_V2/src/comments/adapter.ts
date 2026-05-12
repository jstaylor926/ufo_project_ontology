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
 */

import {
  Function,
  FunctionsMap,
  OntologyEditFunction,
  Timestamp,
  type ObjectSet,
  type Ufoentry,
  type UfoFsr,
} from "@foundry/functions-api";
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
   * counts are zero.
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
   */
  @Function()
  public commentsByCode(
    entries: ObjectSet<Ufoentry>,
    code: CommentCode,
    fsr: UfoFsr,
  ): string {
    let out = "";
    for (const e of entries.all()) {
      const filtered = filterByCode(readEntryComments(e), code);
      out += renderCommentMarkdown(filtered, {
        newSince: sinceFrom(fsr),
        users: COMMENT_USERS,
      });
    }
    return out;
  }

  /**
   * Replaces V1 `mostRecentPartsComment` / `mostRecentTechnicalComment` /
   * `mostRecentCustSuppComments`. One dispatch.
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

  /** Replaces V1 `linkedComments` markdown renderer. */
  @Function()
  public linkedCommentsMarkdown(
    entries: ObjectSet<Ufoentry>,
    fsr: UfoFsr,
  ): string {
    let out = "";
    for (const e of entries.all()) {
      out += renderLinkedMarkdown(readLinkedComments(e), e.idDossier ?? "", {
        newSince: sinceFrom(fsr),
        users: COMMENT_USERS,
      });
    }
    return out;
  }

  /** Replaces V1 `mostRecentLinkedComment`. */
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

  /**
   * Replaces V1 `addCommentstoUFOEntry`.
   *
   * Writes both to the originating entry's `comments` array and, when
   * `link === true`, to every supplied linked dossier's `linkedComments`
   * array. Storage remains V1 string-encoded so the existing V1 ontology
   * keeps reading correctly during the transition.
   */
  @OntologyEditFunction()
  public addComment(
    entry: Ufoentry,
    body: string,
    code: CommentCode,
    authorDisplay: string,
    link: boolean,
    linkedEntries: ObjectSet<Ufoentry>,
  ): void {
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
}
