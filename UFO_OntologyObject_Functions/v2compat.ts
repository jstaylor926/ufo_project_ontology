/**
 * V1 ↔ V2 priority-algorithm key alias map.
 *
 * The V1 prioritization driver — see `MyFunctions.getPriorityValsForOneEntry`
 * in `index.ts` — uses a `switch` keyed on the parameter strings recorded
 * on a `PriorityAlgorithm` object. Those strings were chosen to match the
 * V1 dataset column names, e.g. "operator_ICAO", "Dossier_CreationDate",
 * "highest_Message_Urgency".
 *
 * When TechRequest V2 lands, the same business concepts surface under
 * snake_case names — "operator_code_icao", "creation_time",
 * "highest_message_urgency". The Phase 3 ontology re-shape will retire
 * the V1 names entirely, but in the interim a `PriorityAlgorithm` may be
 * authored against V2-named parameters before that happens.
 *
 * This module provides a small translation table the V1 driver consults
 * before its switch. A V2 key is rewritten to the V1 equivalent so the
 * existing switch arms continue to handle it. V1 keys pass through
 * unchanged. Unknown keys also pass through, preserving the V1 default
 * behavior (unknown keys hit no case and contribute nothing to the score).
 *
 * To extend: add a new V2 → V1 entry to V2_TO_V1_PRIORITY_KEYS. The
 * V1 switch in `index.ts` does not need to change.
 *
 * This module is import-safe — no Foundry-API imports beyond what
 * `index.ts` already pulls in.
 */

/**
 * Maps V2 parameter strings to their V1 equivalents.
 * Keys are V2 names (snake_case, V2 ontology). Values are V1 names that
 * the V1 prioritization switch already handles.
 */
export const V2_TO_V1_PRIORITY_KEYS: Readonly<Record<string, string>> = Object.freeze({
    // identity
    "dossier_id":                 "id_dossier",
    "dossier_internal_id":        "dossier_internal_id",
    // classification
    "dossier_domain":             "Domain",
    "dossier_title":              "Title",
    "dossier_label":              "dossierLabel",
    "dossier_channel":            "Channel",
    "is_dossier_migrated":        "Dossier_isMigrated",
    "dossier_status":             "Status",
    // aircraft
    "aircraft_program_code":      "Program_Letter",
    "aircraft_program":           "Program",
    "manufacturer_aircraft_id":   "AircraftID",
    "skywise_aircraft_id":        "Skywise_AircraftID",
    "is_applicable_for_all_msn":  "isapplicable_forAll_MSN",
    "aircraft_msn":               "MSN",
    "aircraft_type":              "Aircraft_Type",
    "aircraft_model":             "Aircraft_Model",
    "registration_number":        "Registration_Number",
    "aircraft_flight_hours":      "Aircraft_Flighthrs",
    "aircraft_flight_cycles":     "Aircraft_Flightcycs",
    "operator_code_icao":         "operator_ICAO",
    // powerplant / component
    "engine_series":              "engineSeries",
    "engine_model":               "engineModel",
    "component_serial_number":    "component_SerialNum",
    "component_part_number":      "component_PartNum",
    "component_flight_cycles":    "component_Flightcycs",
    "component_flight_hours":     "component_FlightHrs",
    // ATA
    "ata_chapter":                "ata_Chapter",
    "ata":                        "ata_4d",
    // parties
    "requestor_company_code_icao": "Dossier_Requestor_ICAO",
    "visible_by_company_code_icao": "Dossier_VisbleBy_ICAO",
    // lifecycle timestamps
    "creation_time":              "Dossier_CreationDate",
    "update_time":                "Dossier_UpDate",
    "submit_time":                "Dossier_SubmitDate",
    "closure_time":               "Dossier_ClosureDate",
    // message rollups
    "number_total_messages":      "nb_TotalMessages",
    "number_closed_messages":     "nb_ClosedMessages",
    "message_soonest_requested_answer_time": "Message_Soonest_ReqDate",
    "highest_message_urgency":    "highest_Message_Urgency",
    "is_message_open":            "Message_Open",
    "has_approval_doc":           "has_Approval_Doc",
    "approval_doc_type":          "approval_doc_type",
});

/**
 * Translate a V2 priority-algorithm key to its V1 equivalent. Returns the
 * input unchanged if no mapping exists.
 *
 * @param key   The parameter name read from `PriorityAlgorithm.priorityParameter*`.
 * @returns     The V1 key the V1 driver's switch already handles, or the
 *              original key when no translation is registered.
 */
export function toV1PriorityKey(key: string | undefined): string | undefined {
    if (key === undefined) return key;
    return V2_TO_V1_PRIORITY_KEYS[key] ?? key;
}
