/**
 * FSR V2 — public surface.
 *
 * Re-exports the pure logic and the Foundry adapter so consumers
 * (tests or other V2 modules) can `import { … } from "./fsr"`.
 */

export { INACTIVITY_THRESHOLD_MS } from "./types.js";
export { isInactive } from "./identity.js";
export { addFavorites, removeFavorites, isFavoriteOf } from "./favorites.js";
export { selectTeamMembers, type FsrLite } from "./teams.js";
export { FSRFunctionsV2, FsrTeamV2 } from "./adapter.js";
