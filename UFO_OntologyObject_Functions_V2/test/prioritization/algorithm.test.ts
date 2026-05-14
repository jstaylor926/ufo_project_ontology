import { describe, expect, it } from "vitest";
import {
  calculateGlobalScore,
  getParameterValues,
} from "../../src/prioritization/algorithm.js";
import type { EntryLike } from "../../src/prioritization/parameters.js";
import type { PriorityAlgorithmConfig } from "../../src/prioritization/types.js";

const FIXED_NOW = new Date("2026-05-14T00:00:00Z");

const sampleEntry: EntryLike = {
  idDossier: "DOSS-001",
  domain: "Repair",
  operIcao: "AAL",
  craftFlighthrs: 18000,
  highestMessUrg: "Critical",
  status: "Open",
  customerEscalation: true,
  internalEscalation: true,
  partsEscalation: false,
  trStatus: "At Customer",
  dossCreDate: { toISOString: () => "2026-05-07T00:00:00Z" }, // 7 days ago
};

describe("getParameterValues", () => {
  it("flattens every parameter in slot order", () => {
    const config: PriorityAlgorithmConfig = {
      algorithmId: "default",
      parameters: [
        { key: "highest_message_urgency", isSpan: false, tiers: [] },
        { key: "operator_code_icao", isSpan: false, tiers: ["AAL", "DAL"] },
      ],
    };
    expect(getParameterValues(config, sampleEntry)).toEqual([
      { key: "highest_message_urgency", value: "Critical" },
      { key: "operator_code_icao", value: "AAL" },
    ]);
  });

  it("throws on an unknown parameter key", () => {
    const config: PriorityAlgorithmConfig = {
      algorithmId: "default",
      parameters: [{ key: "not_a_real_param", isSpan: false, tiers: [] }],
    };
    expect(() => getParameterValues(config, sampleEntry)).toThrow(
      /Unknown priority parameter key/,
    );
  });
});

describe("calculateGlobalScore", () => {
  it("returns bump alone for an empty parameter list", () => {
    const config: PriorityAlgorithmConfig = {
      algorithmId: "default",
      parameters: [],
    };
    expect(calculateGlobalScore(config, sampleEntry, 12, FIXED_NOW)).toBe(12);
  });

  it("single-parameter config: weight = 1.0", () => {
    // n=1 → arithmeticSum=1 → weight(0) = 1
    // highest_message_urgency=Critical → 50, ×1.0 → 50, +0 bump = 50
    const config: PriorityAlgorithmConfig = {
      algorithmId: "default",
      parameters: [
        { key: "highest_message_urgency", isSpan: false, tiers: [] },
      ],
    };
    expect(calculateGlobalScore(config, sampleEntry, 0, FIXED_NOW)).toBe(50);
  });

  it("two-parameter config: V1 arithmetic-series weighting", () => {
    // n=2 → arithmeticSum=3
    // slot 0: highest_message_urgency=Critical → 50, weight=2/3 → 33.33
    // slot 1: operator_code_icao=AAL → 100, weight=1/3 → 33.33
    // total = 66.66 → round = 67 + 0 bump
    const config: PriorityAlgorithmConfig = {
      algorithmId: "default",
      parameters: [
        { key: "highest_message_urgency", isSpan: false, tiers: [] },
        { key: "operator_code_icao", isSpan: false, tiers: ["AAL", "DAL"] },
      ],
    };
    expect(calculateGlobalScore(config, sampleEntry, 0, FIXED_NOW)).toBe(67);
  });

  it("applies the SBC bump after rounding", () => {
    const config: PriorityAlgorithmConfig = {
      algorithmId: "default",
      parameters: [
        { key: "highest_message_urgency", isSpan: false, tiers: [] },
      ],
    };
    expect(calculateGlobalScore(config, sampleEntry, 15, FIXED_NOW)).toBe(65);
  });

  it("treats missing properties as 0 (V1 parity for No Value)", () => {
    const emptyEntry: EntryLike = {};
    const config: PriorityAlgorithmConfig = {
      algorithmId: "default",
      parameters: [
        { key: "highest_message_urgency", isSpan: false, tiers: [] },
        { key: "operator_code_icao", isSpan: false, tiers: ["AAL"] },
      ],
    };
    expect(calculateGlobalScore(config, emptyEntry, 0, FIXED_NOW)).toBe(0);
  });

  it("hardcoded specials (escalations) ignore tiers", () => {
    // sampleEntry has 2 escalations → escalations strategy: 2 × 33 = 66.
    // Tiers field is set to bogus data to prove it is unused.
    const config: PriorityAlgorithmConfig = {
      algorithmId: "default",
      parameters: [
        { key: "Escalations", isSpan: false, tiers: ["bogus", "more bogus"] },
      ],
    };
    expect(calculateGlobalScore(config, sampleEntry, 0, FIXED_NOW)).toBe(66);
  });

  it("date strategy uses the injected clock", () => {
    // dossCreDate = FIXED_NOW - 7 days → days = -7.
    // span tiers ["7","-365","span"]: max=7, min=-365, range=372.
    //   reflected = 372 - (days - min) = 372 - (-7 - (-365)) = 14
    //   spanOrBlock("14", ["372","0"], true) = 14/372 * 100 ≈ 3.76
    // n=1 → weight=1.0 → score=3.76 → round=4.
    const config: PriorityAlgorithmConfig = {
      algorithmId: "default",
      parameters: [
        { key: "creation_time", isSpan: false, tiers: ["7", "-365", "span"] },
      ],
    };
    expect(calculateGlobalScore(config, sampleEntry, 0, FIXED_NOW)).toBe(4);
  });
});
