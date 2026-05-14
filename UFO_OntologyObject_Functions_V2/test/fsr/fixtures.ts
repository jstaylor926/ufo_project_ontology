/**
 * FSR V2 — reusable test fixtures.
 */

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const ONE_YEAR_MS = 365 * ONE_DAY_MS;

/** Anchor "now" — 2026-05-14 12:00 UTC, matching the current project date. */
export const NOW = Date.UTC(2026, 4, 14, 12, 0, 0);

/** A login from 366 days ago — inactive by the 1y threshold. */
export const INACTIVE_LOGIN = NOW - ONE_YEAR_MS - ONE_DAY_MS;

/** A login from 30 days ago — well within the active window. */
export const ACTIVE_LOGIN = NOW - 30 * ONE_DAY_MS;

/** Dossier IDs used across favorites tests. */
export const DOSSIER_A = "81000001";
export const DOSSIER_B = "81000002";
export const DOSSIER_C = "81000003";
