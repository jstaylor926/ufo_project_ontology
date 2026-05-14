/**
 * FSR V2 — types and constants.
 *
 * The FSR module ports `UFO_OntologyObject_Functions/FSRFunctions.ts` to
 * the V2 layout. The pure core lives in `identity.ts` (inactivity check)
 * and `favorites.ts` (add / remove / membership). The adapter wires those
 * pure functions into Foundry `@OntologyEditFunction` / `@Function`
 * decorators. No Foundry imports in this file.
 *
 * The V1 module used `currentLogIn`; the V2 ontology spec §4.3 names it
 * `lastLogIn`. The rename happens at the adapter boundary — pure functions
 * never see a Foundry-shaped object.
 */

/** UFO compliance window: an FSR is "inactive" once one year elapses since their last login. */
export const INACTIVITY_THRESHOLD_MS = 365 * 24 * 60 * 60 * 1000;
