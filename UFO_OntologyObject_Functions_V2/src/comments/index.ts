/**
 * Comments V2 — public surface.
 *
 * Re-exports the pure logic and the Foundry adapter together so consumers
 * (tests or other V2 modules) can `import { … } from "./comments"`.
 */

export * from "./types.js";
export {
  parseEntryComment,
  parseLinkedComment,
  parseTeamComment,
  toEntryComment,
  toLinkedComment,
  toTeamComment,
  resolveMentions,
} from "./parse.js";
export {
  filterByCode,
  mostRecent,
  countByCode,
  summarizeCounts,
  renderCommentMarkdown,
  renderLinkedMarkdown,
  type RenderOptions,
} from "./views.js";
export { COMMENT_USERS } from "./dictionary.js";
export { CommentsV2 } from "./adapter.js";
