import { describe, expect, it } from "vitest";
import {
  PARAMETERS,
  parameterDef,
  type EntryLike,
} from "../../src/prioritization/parameters.js";

const emptyEntry: EntryLike = {};

describe("parameterDef", () => {
  it("resolves a known V2 key", () => {
    expect(parameterDef("operator_code_icao")).toBeDefined();
    expect(parameterDef("operator_code_icao")!.strategy).toBe("exactMatch");
  });

  it("returns undefined for an unknown key", () => {
    expect(parameterDef("not_a_real_parameter")).toBeUndefined();
  });

  it("still resolves V1-spelled hardcoded specials (until P3)", () => {
    expect(parameterDef("highest_message_urgency")!.strategy).toBe(
      "messageUrgency",
    );
    expect(parameterDef("AircraftStatus")!.strategy).toBe("aircraftStatus");
    expect(parameterDef("TR Status")!.strategy).toBe("trStatus");
    expect(parameterDef("Escalations")!.strategy).toBe("escalations");
  });
});

describe("PARAMETERS — readers", () => {
  it("reads scalar string properties", () => {
    const e: EntryLike = { domain: "Repair", channel: "Web" };
    expect(PARAMETERS["dossier_domain"].read(e)).toBe("Repair");
    expect(PARAMETERS["dossier_channel"].read(e)).toBe("Web");
  });

  it("stringifies number properties", () => {
    const e: EntryLike = { msn: 12345, craftFlighthrs: 24000 };
    expect(PARAMETERS["aircraft_msn"].read(e)).toBe("12345");
    expect(PARAMETERS["aircraft_flight_hours"].read(e)).toBe("24000");
  });

  it("stringifies boolean properties", () => {
    const e: EntryLike = { isMigrated: true, messOpen: false };
    expect(PARAMETERS["is_dossier_migrated"].read(e)).toBe("true");
    expect(PARAMETERS["is_message_open"].read(e)).toBe("false");
  });

  it("ISO-serializes timestamp properties", () => {
    const ts = { toISOString: () => "2026-05-14T00:00:00.000Z" };
    const e: EntryLike = { dossCreDate: ts };
    expect(PARAMETERS["creation_time"].read(e)).toBe(
      "2026-05-14T00:00:00.000Z",
    );
  });

  it("message_soonest_requested_answer_time reads newRequestDate (V1 parity)", () => {
    // V1 deliberately reads the FSR-override newRequestDate here, not the
    // raw message soonest date. See index.ts:439 for the rationale.
    const ts = { toISOString: () => "2026-06-01T00:00:00.000Z" };
    const e: EntryLike = { newRequestDate: ts };
    expect(
      PARAMETERS["message_soonest_requested_answer_time"].read(e),
    ).toBe("2026-06-01T00:00:00.000Z");
  });

  it("Escalations counts boolean flags", () => {
    expect(
      PARAMETERS["Escalations"].read({
        customerEscalation: true,
        internalEscalation: true,
        partsEscalation: false,
      }),
    ).toBe("2");
    expect(PARAMETERS["Escalations"].read({})).toBe("0");
  });

  it("returns undefined for missing properties", () => {
    expect(PARAMETERS["dossier_domain"].read(emptyEntry)).toBeUndefined();
    expect(PARAMETERS["aircraft_msn"].read(emptyEntry)).toBeUndefined();
    expect(PARAMETERS["creation_time"].read(emptyEntry)).toBeUndefined();
  });
});

describe("PARAMETERS — coverage", () => {
  // Sourced from UFO_OntologyObject_Functions/v2compat.ts::V2_TO_V1_PRIORITY_KEYS.
  // Three keys are intentionally NOT in PARAMETERS yet (no Ufoentry field to read):
  //   - dossier_id           (identity; not a scoreable property)
  //   - dossier_internal_id  (identity; not a scoreable property)
  //   - component_FIN        (V1 reads entry.compFin but stub omits it)
  const expectedV2Keys = [
    "dossier_domain",
    "dossier_title",
    "dossier_label",
    "dossier_channel",
    "is_dossier_migrated",
    "dossier_status",
    "aircraft_program_code",
    "aircraft_program",
    "manufacturer_aircraft_id",
    "skywise_aircraft_id",
    "is_applicable_for_all_msn",
    "aircraft_msn",
    "aircraft_type",
    "aircraft_model",
    "registration_number",
    "aircraft_flight_hours",
    "aircraft_flight_cycles",
    "operator_code_icao",
    "engine_series",
    "engine_model",
    "component_serial_number",
    "component_part_number",
    "component_flight_cycles",
    "component_flight_hours",
    "ata_chapter",
    "ata",
    "requestor_company_code_icao",
    "visible_by_company_code_icao",
    "creation_time",
    "update_time",
    "submit_time",
    "closure_time",
    "number_total_messages",
    "number_closed_messages",
    "message_soonest_requested_answer_time",
    "highest_message_urgency",
    "is_message_open",
    "has_approval_doc",
    "approval_doc_type",
  ] as const;

  it.each(expectedV2Keys)("registers a definition for %s", (key) => {
    expect(parameterDef(key), `missing parameter: ${key}`).toBeDefined();
  });
});
