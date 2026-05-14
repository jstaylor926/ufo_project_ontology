/**
 * Reporting V2 — Foundry adapter.
 *
 * Replaces V1 `reportGenerator.ts`. The class exposes a single decorated
 * entry point — `reportDriver(team)` — bound to the `Fsrteam.escalationReportHtml`
 * function-backed property (Spec §7.3, Workshop scheduled-batch trigger,
 * not a true reactive property).
 *
 * Adapter responsibilities:
 *   - Walk `team.ufofsrs[*].ufoescalations` and project each escalation
 *     into the clean `ReportEscalation` shape (in particular, strip the
 *     `escalationRasisedDate` V1 typo into a numeric `raisedAtMs`).
 *   - Inject `Timestamp.now()` so pure logic stays clock-free.
 *   - Build the `Notification` envelope (long email body + short tile).
 *
 * V1 `getActions` / `translateActions` are not ported — V1's `getActions`
 * logged but returned `""` and `translateActions` was an empty stub. The
 * intended log-replay surface is Order #7 in §7.2 (`fsrEntryDriver` →
 * `src/fsr/edit.ts`), not the reporting module.
 */

import {
  EmailNotificationContent,
  Function,
  Notification,
  ShortNotification,
  Timestamp,
} from "@foundry/functions-api";
import { Fsrteam, type Ufoescalation } from "@foundry/ontology-api";
import { groupRecentTeamComments } from "./comments.js";
import { recentEscalations } from "./escalations.js";
import { renderReportBody } from "./render.js";
import type { ReportEscalation } from "./types.js";

/** Project a V1 `Ufoescalation` into the pure-logic shape. */
function projectEscalation(e: Ufoescalation): ReportEscalation {
  return {
    raisedAtMs: e.escalationRasisedDate?.valueOf(),
    user: e.user ?? "",
    escalationType: e.escalationType ?? "",
    dossierId: e.dossierId ?? "",
  };
}

/** Flatten every escalation across every FSR on the team. */
function collectTeamEscalations(team: Fsrteam): ReportEscalation[] {
  const out: ReportEscalation[] = [];
  for (const fsr of team.ufofsrs.all()) {
    for (const e of fsr.ufoescalations.all()) {
      out.push(projectEscalation(e));
    }
  }
  return out;
}

export class ReportGeneratorV2 {
  /**
   * Replaces V1 `reportDriver`. Produces a `Notification` whose email
   * body lists today's escalations and recent team comments, addressed
   * to the team's operator group.
   *
   * Bound to `Fsrteam.escalationReportHtml` (FBP §7.3).
   */
  @Function()
  public reportDriver(team: Fsrteam): Notification {
    if (team == null) {
      throw new Error("reportDriver: team is required");
    }
    const nowMs = Timestamp.now().valueOf();
    const escalations = recentEscalations(collectTeamEscalations(team), nowMs);
    const commentsByDossier = groupRecentTeamComments(team.comments, nowMs);
    const body = renderReportBody(escalations, commentsByDossier);

    const subject = `Escalation Report - ${team.operatorCode ?? ""}`;

    const email = EmailNotificationContent.builder()
      .subject(subject)
      .body(body)
      .build();

    const short = ShortNotification.builder()
      .heading("Escalation Report")
      .content("escalation")
      .build();

    return Notification.builder()
      .shortNotification(short)
      .emailNotificationContent(email)
      .build();
  }
}
