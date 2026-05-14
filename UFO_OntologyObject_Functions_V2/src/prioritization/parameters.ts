/**
 * Prioritization V2 — parameter table.
 *
 * Single source of truth for "which V2 parameters are scoreable, and how
 * does the algorithm read them off a Ufoentry". Replaces two pieces of V1:
 *
 *   1. The ~290-line `switch` in `getPriorityValsForOneEntry` (index.ts:232)
 *      — V1 keyed by V1 column name (`"operator_ICAO"`, `"Dossier_CreationDate"`).
 *      V2 keys by snake_case V2 name natively — `v2compat.ts::toV1PriorityKey`
 *      retires when this port lands.
 *   2. The five inline arrays in `calculatePropertyScore` (`exact_Matches`,
 *      `spans`, `dates`, `binaryMatches`, `keywords`) plus the five
 *      hardcoded specials (`Priority`, `highest_Message_Urgency`,
 *      `AircraftStatus`, `Escalations`, `TR Status`).
 *
 * Each row pins a parameter's strategy *and* its reader. Unknown keys are
 * caught at config-validation time rather than silently scoring zero.
 *
 * Pure — Ufoentry comes in via a structural-typed `EntryLike` (only the
 * properties this module reads are listed). No `@foundry/*` imports.
 */

import type { ScoringStrategy } from "./types.js";

/**
 * Structural slice of `Ufoentry` listing only the fields the parameter
 * table reads. Keeping it structural lets the algorithm/test layers pass
 * plain objects without depending on the Foundry stub class.
 *
 * Field names match `src/types/foundry-stubs.ts::Ufoentry` exactly. When
 * the Phase-3 ontology re-shape renames properties (`idDossier` → V2-named
 * `dossierId`, etc.), update this interface and every reader below in one
 * sweep.
 */
export interface EntryLike {
  // Identity & classification
  idDossier?: string;
  internalId?: string;
  domain?: string;
  title?: string;
  label?: string;
  channel?: string;
  isMigrated?: boolean;
  status?: string;
  // Aircraft
  programLetter?: string;
  program?: string;
  aircraftId?: string;
  skywiseAircraftId?: string;
  isappforAllMsn?: boolean;
  msn?: number;
  aircraftType?: string;
  aircraftModel?: string;
  regNumber?: string;
  craftFlighthrs?: number;
  craftFlightcycs?: number;
  operIcao?: string;
  // Component / powerplant
  engineSeries?: string;
  engineModel?: string;
  compSerialNum?: string;
  compPartNum?: string;
  compFlightcycs?: number;
  compFlightHrs?: number;
  compFin?: string;
  // ATA
  ataChap?: number;
  ata4d?: number;
  // Parties
  dossReqIcao?: string;
  dossVisIcao?: string;
  // Lifecycle dates — Foundry Timestamp has `.toISOString()`. Test doubles
  // can supply any object with the same method; the reader only calls that.
  dossCreDate?: { toISOString(): string };
  dossUpDate?: { toISOString(): string };
  dossSubDate?: { toISOString(): string };
  dossClosDate?: { toISOString(): string };
  newRequestDate?: { toISOString(): string };
  rts?: { toISOString(): string };
  msnRts?: { toISOString(): string };
  // Message rollups
  nbTotalMess?: number;
  nbClosedMess?: number;
  highestMessUrg?: string;
  messOpen?: boolean;
  hasAppDoc?: boolean;
  appDocType?: string;
  // FSR-driven
  aircraftStatus?: string;
  trStatus?: string;
  customerEscalation?: boolean;
  internalEscalation?: boolean;
  partsEscalation?: boolean;
  // SBC
  sbcbump?: number;
}

/** Read a property off an entry and flatten to a string for the scorer. */
type Reader = (entry: EntryLike) => string | undefined;

/** A parameter definition: the strategy plus the reader. */
export interface ParameterDef {
  strategy: ScoringStrategy;
  read: Reader;
}

// ── small helpers ─────────────────────────────────────────────────────────
const str = (v: string | undefined): string | undefined => v;
const bool = (v: boolean | undefined): string | undefined =>
  v === undefined ? undefined : v.toString();
const num = (v: number | undefined): string | undefined =>
  v === undefined ? undefined : v.toString();
const iso = (v: { toISOString(): string } | undefined): string | undefined =>
  v === undefined ? undefined : v.toISOString();

/**
 * Parameter table keyed by V2 snake_case name. Values fix the scoring
 * strategy and the reader. V1 column names appear only in comments,
 * sourced from `UFO_OntologyObject_Functions/v2compat.ts`.
 */
export const PARAMETERS: Readonly<Record<string, ParameterDef>> = Object.freeze({
  // ── exactMatch ────────────────────────────────────────────────────────
  "dossier_domain":            { strategy: "exactMatch", read: (e) => str(e.domain) },
  "dossier_channel":           { strategy: "exactMatch", read: (e) => str(e.channel) },
  "dossier_label":             { strategy: "exactMatch", read: (e) => str(e.label) },
  "aircraft_program_code":     { strategy: "exactMatch", read: (e) => str(e.programLetter) },
  "aircraft_program":          { strategy: "exactMatch", read: (e) => str(e.program) },
  "manufacturer_aircraft_id":  { strategy: "exactMatch", read: (e) => str(e.aircraftId) },
  "skywise_aircraft_id":       { strategy: "exactMatch", read: (e) => str(e.skywiseAircraftId) },
  "aircraft_msn":              { strategy: "exactMatch", read: (e) => num(e.msn) },
  "aircraft_type":             { strategy: "exactMatch", read: (e) => str(e.aircraftType) },
  "aircraft_model":            { strategy: "exactMatch", read: (e) => str(e.aircraftModel) },
  "registration_number":       { strategy: "exactMatch", read: (e) => str(e.regNumber) },
  "operator_code_icao":        { strategy: "exactMatch", read: (e) => str(e.operIcao) },
  "engine_series":             { strategy: "exactMatch", read: (e) => str(e.engineSeries) },
  "engine_model":              { strategy: "exactMatch", read: (e) => str(e.engineModel) },
  "component_serial_number":   { strategy: "exactMatch", read: (e) => str(e.compSerialNum) },
  "component_part_number":     { strategy: "exactMatch", read: (e) => str(e.compPartNum) },
  "ata_chapter":               { strategy: "exactMatch", read: (e) => num(e.ataChap) },
  "ata":                       { strategy: "exactMatch", read: (e) => num(e.ata4d) },
  "requestor_company_code_icao":  { strategy: "exactMatch", read: (e) => str(e.dossReqIcao) },
  "visible_by_company_code_icao": { strategy: "exactMatch", read: (e) => str(e.dossVisIcao) },
  "approval_doc_type":         { strategy: "exactMatch", read: (e) => str(e.appDocType) },

  // ── span (numeric) ────────────────────────────────────────────────────
  "aircraft_flight_hours":     { strategy: "span", read: (e) => num(e.craftFlighthrs) },
  "aircraft_flight_cycles":    { strategy: "span", read: (e) => num(e.craftFlightcycs) },
  "component_flight_cycles":   { strategy: "span", read: (e) => num(e.compFlightcycs) },
  "component_flight_hours":    { strategy: "span", read: (e) => num(e.compFlightHrs) },
  "number_total_messages":     { strategy: "span", read: (e) => num(e.nbTotalMess) },
  "number_closed_messages":    { strategy: "span", read: (e) => num(e.nbClosedMess) },

  // ── date ──────────────────────────────────────────────────────────────
  "creation_time":             { strategy: "date", read: (e) => iso(e.dossCreDate) },
  "update_time":               { strategy: "date", read: (e) => iso(e.dossUpDate) },
  "submit_time":               { strategy: "date", read: (e) => iso(e.dossSubDate) },
  "closure_time":              { strategy: "date", read: (e) => iso(e.dossClosDate) },
  // V1 reads `newRequestDate` here, not `messSoonestReqDate` — comment on
  // index.ts:439 explains: FSR overrides the soonest message date via
  // newRequestDate, so prioritization always uses the override.
  "message_soonest_requested_answer_time": { strategy: "date", read: (e) => iso(e.newRequestDate) },
  // RTS / MSN RTS — no V2 spelling in v2compat.ts yet. Likely added during
  // FSR-entry-driver port (#7). Kept V1-spelled for now so existing
  // PriorityAlgorithm configs still resolve.
  "RTS":                       { strategy: "date", read: (e) => iso(e.rts) },
  "MSN RTS":                   { strategy: "date", read: (e) => iso(e.msnRts) },

  // ── binary ────────────────────────────────────────────────────────────
  "is_dossier_migrated":       { strategy: "binary", read: (e) => bool(e.isMigrated) },
  "dossier_status":            { strategy: "binary", read: (e) => str(e.status) },
  "is_applicable_for_all_msn": { strategy: "binary", read: (e) => bool(e.isappforAllMsn) },
  "is_message_open":           { strategy: "binary", read: (e) => bool(e.messOpen) },
  "has_approval_doc":          { strategy: "binary", read: (e) => bool(e.hasAppDoc) },

  // ── keyword ───────────────────────────────────────────────────────────
  "dossier_title":             { strategy: "keyword", read: (e) => str(e.title) },

  // ── hardcoded specials (ignore tiers in score.ts) ─────────────────────
  // These V1 names have no V2 equivalent in v2compat.ts. They stay
  // V1-spelled in V2 PriorityAlgorithm.parameters[].key until Phase-3
  // ontology re-shape defines V2 names — at which point we add the V2 key
  // and migrate existing configs.
  "Priority":                  { strategy: "priority",      read: () => undefined /* V1 reads `entry.priority` but the Ufoentry stub has no such field — V1 dead path preserved */ },
  "highest_message_urgency":   { strategy: "messageUrgency", read: (e) => str(e.highestMessUrg) },
  "AircraftStatus":            { strategy: "aircraftStatus", read: (e) => str(e.aircraftStatus) },
  "TR Status":                 { strategy: "trStatus",      read: (e) => str(e.trStatus) },
  "Escalations":               {
    strategy: "escalations",
    read: (e) => {
      let count = 0;
      if (e.customerEscalation) count++;
      if (e.internalEscalation) count++;
      if (e.partsEscalation) count++;
      return count.toString();
    },
  },
});

/**
 * Look up a parameter definition. Returns undefined when no V2 mapping
 * exists — adapter validates and throws so unknown keys surface at
 * config time, not silently as zero scores.
 */
export function parameterDef(key: string): ParameterDef | undefined {
  return PARAMETERS[key];
}
