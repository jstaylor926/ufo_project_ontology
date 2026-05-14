/**
 * Reporting V2 — public surface.
 */

export { REPORT_WINDOW_MS, type ReportEscalation } from "./types.js";
export { recentEscalations } from "./escalations.js";
export { groupRecentTeamComments } from "./comments.js";
export {
  renderCommentDigest,
  renderEscalationList,
  renderReportBody,
} from "./render.js";
export { ReportGeneratorV2 } from "./adapter.js";
