import { describe, expect, it } from "vitest";
import { scoreOne } from "../../src/prioritization/score.js";
import type { ParameterValue } from "../../src/prioritization/types.js";

const v = (key: string, value: string | undefined): ParameterValue => ({
  key,
  value,
});

describe("scoreOne — common short-circuits", () => {
  it('returns 0 when value is "No Value"', () => {
    expect(scoreOne("exactMatch", ["A", "B"], v("k", "No Value"))).toBe(0);
  });
  it("returns 0 when value is undefined", () => {
    expect(scoreOne("exactMatch", ["A", "B"], v("k", undefined))).toBe(0);
  });
});

describe("scoreOne — hardcoded specials", () => {
  it("priority maps Amber=50 / Red=100 / else=0", () => {
    expect(scoreOne("priority", [], v("Priority", "Amber"))).toBe(50);
    expect(scoreOne("priority", [], v("Priority", "Red"))).toBe(100);
    expect(scoreOne("priority", [], v("Priority", "Green"))).toBe(0);
  });

  it("messageUrgency maps the V1 ladder", () => {
    expect(scoreOne("messageUrgency", [], v("k", "Regular"))).toBe(25);
    expect(scoreOne("messageUrgency", [], v("k", "Critical"))).toBe(50);
    expect(scoreOne("messageUrgency", [], v("k", "High"))).toBe(75);
    expect(scoreOne("messageUrgency", [], v("k", "AOG"))).toBe(100);
    expect(scoreOne("messageUrgency", [], v("k", "Unknown"))).toBe(0);
  });

  it("aircraftStatus maps AOG=100 / Heavy WSP=67 / Heavy Visit=33", () => {
    expect(scoreOne("aircraftStatus", [], v("k", "AOG"))).toBe(100);
    expect(
      scoreOne("aircraftStatus", [], v("k", "Heavy Maintenance WSP")),
    ).toBe(67);
    expect(
      scoreOne("aircraftStatus", [], v("k", "Heavy Maintenance Visit")),
    ).toBe(33);
    expect(scoreOne("aircraftStatus", [], v("k", "Operational"))).toBe(0);
  });

  it("escalations is count × 33 (V1 parity)", () => {
    expect(scoreOne("escalations", [], v("k", "0"))).toBe(0);
    expect(scoreOne("escalations", [], v("k", "1"))).toBe(33);
    expect(scoreOne("escalations", [], v("k", "2"))).toBe(66);
    expect(scoreOne("escalations", [], v("k", "3"))).toBe(99);
  });

  it("trStatus maps the V1 8-step ladder", () => {
    expect(scoreOne("trStatus", [], v("k", "At Customer"))).toBe(100);
    expect(scoreOne("trStatus", [], v("k", "Interim to Definitive"))).toBe(85.5);
    expect(scoreOne("trStatus", [], v("k", "To Be Assigned"))).toBe(71.25);
    expect(scoreOne("trStatus", [], v("k", "At DO for Justif"))).toBe(57);
    expect(scoreOne("trStatus", [], v("k", "At DO for Repair"))).toBe(42.75);
    expect(scoreOne("trStatus", [], v("k", "At DOA"))).toBe(28.5);
    expect(scoreOne("trStatus", [], v("k", "RDAF Approved"))).toBe(14.25);
    expect(scoreOne("trStatus", [], v("k", "Completed"))).toBe(0);
    expect(scoreOne("trStatus", [], v("k", "Anything Else"))).toBe(0);
  });
});

describe("scoreOne — exactMatch", () => {
  const tiers = ["AAL", "DAL", "JBU", "ASA", "FFT"];
  it("scores tier 0 at 100", () => {
    expect(scoreOne("exactMatch", tiers, v("operator_code_icao", "AAL"))).toBe(
      100,
    );
  });
  it("scores tier 1 at 80 (100 - 1×20)", () => {
    expect(scoreOne("exactMatch", tiers, v("operator_code_icao", "DAL"))).toBe(
      80,
    );
  });
  it("scores tier 4 at 20 (100 - 4×20)", () => {
    expect(scoreOne("exactMatch", tiers, v("operator_code_icao", "FFT"))).toBe(
      20,
    );
  });
  it("scores 0 for an unlisted value", () => {
    expect(scoreOne("exactMatch", tiers, v("operator_code_icao", "HAL"))).toBe(
      0,
    );
  });
  it("scores 0 when tier list is empty (V1 would divide by zero)", () => {
    expect(scoreOne("exactMatch", [], v("operator_code_icao", "AAL"))).toBe(0);
  });
});

describe("scoreOne — binary", () => {
  it("scores 100 when value matches tier 0", () => {
    expect(scoreOne("binary", ["Open"], v("dossier_status", "Open"))).toBe(100);
  });
  it("scores 0 otherwise — V1 PARITY: this is the known surprise for dossier_status", () => {
    // V1 puts `Status` in binaryMatches; reading "Closed" against tier "Open"
    // collapses to 0 even though Status has 5+ legal values. Documented for
    // the post-port cleanup ticket.
    expect(scoreOne("binary", ["Open"], v("dossier_status", "Closed"))).toBe(0);
  });
});

describe("scoreOne — keyword", () => {
  const tiers = ["Engine", "Fuselage", "Landing Gear"];
  it("scores tier 0 at 100 on substring hit", () => {
    expect(
      scoreOne("keyword", tiers, v("dossier_title", "Engine bracket cracked")),
    ).toBe(100);
  });
  it("scores tier 1 at ~66.67 on substring hit", () => {
    expect(
      scoreOne("keyword", tiers, v("dossier_title", "Fuselage skin defect")),
    ).toBeCloseTo(100 - 100 / 3, 5);
  });
  it("scores 0 when no tier matches", () => {
    expect(
      scoreOne("keyword", tiers, v("dossier_title", "Cabin lighting issue")),
    ).toBe(0);
  });
});

describe("scoreOne — span", () => {
  it("linear interpolation between min and max", () => {
    expect(scoreOne("span", ["24000", "12000"], v("k", "18000"))).toBe(50);
  });
  it("uses sentinel 'span' to mean bounds are slot[0..1]", () => {
    expect(
      scoreOne("span", ["24000", "12000", "span"], v("k", "18000")),
    ).toBe(50);
  });
});

describe("scoreOne — date", () => {
  const now = new Date("2026-05-14T00:00:00Z");

  it("span date: oldest in range scores 100 (V1 parity)", () => {
    // V1 comment on index.ts:712 — "we want -364 scored the highest and 6 scored the lowest".
    // -365 days against tiers [7, -365]: reflected to 372, pinned to upper bound → 100.
    expect(
      scoreOne(
        "date",
        ["7", "-365", "span"],
        v("creation_time", "2025-05-14T00:00:00Z"),
        now,
      ),
    ).toBe(100);
  });

  it("span date: newest in range scores 0 (V1 parity)", () => {
    // +7 days → reflected to 0 → pinned to lower bound → 0.
    expect(
      scoreOne(
        "date",
        ["7", "-365", "span"],
        v("creation_time", "2026-05-21T00:00:00Z"),
        now,
      ),
    ).toBe(0);
  });

  it("block date: falls into the bucket the value <= ", () => {
    // Without "span" sentinel, V1 treats tiers as bucket thresholds in
    // descending order. days=-30 against ["7","-365"]: sorted desc [7, -365].
    // sorted[0]=7 >= -30 → index 0 → 100 - 0 * 50 = 100.
    expect(
      scoreOne(
        "date",
        ["7", "-365"],
        v("creation_time", "2026-04-14T00:00:00Z"),
        now,
      ),
    ).toBe(100);
  });
});
