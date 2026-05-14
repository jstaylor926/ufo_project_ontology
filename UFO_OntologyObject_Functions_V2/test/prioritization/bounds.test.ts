import { describe, expect, it } from "vitest";
import {
  daysSince,
  normalizeDateSpan,
  removeDashes,
  sortNumeric,
  spanOrBlock,
} from "../../src/prioritization/bounds.js";

describe("daysSince", () => {
  it("returns 0 for an ISO matching now", () => {
    const now = new Date("2026-05-14T00:00:00Z");
    expect(daysSince("2026-05-14T00:00:00Z", now)).toBe(0);
  });

  it("returns positive days for a future ISO", () => {
    const now = new Date("2026-05-14T00:00:00Z");
    expect(daysSince("2026-05-21T00:00:00Z", now)).toBe(7);
  });

  it("returns negative days for a past ISO", () => {
    const now = new Date("2026-05-14T00:00:00Z");
    expect(daysSince("2026-05-07T00:00:00Z", now)).toBe(-7);
  });

  it("preserves sub-day fractions (V1 parity)", () => {
    const now = new Date("2026-05-14T00:00:00Z");
    expect(daysSince("2026-05-14T12:00:00Z", now)).toBe(0.5);
  });
});

describe("removeDashes", () => {
  it("filters dash placeholders", () => {
    expect(removeDashes(["A", "-", "B", "-", "C"])).toEqual(["A", "B", "C"]);
  });
  it("keeps already-clean arrays unchanged", () => {
    expect(removeDashes(["A", "B"])).toEqual(["A", "B"]);
  });
  it("returns [] for all-dash input", () => {
    expect(removeDashes(["-", "-", "-"])).toEqual([]);
  });
});

describe("sortNumeric", () => {
  it("sorts descending by default request", () => {
    expect(sortNumeric(["5", "1", "10", "3"], true)).toEqual([10, 5, 3, 1]);
  });
  it("sorts ascending when requested", () => {
    expect(sortNumeric(["5", "1", "10", "3"], false)).toEqual([1, 3, 5, 10]);
  });
});

describe("spanOrBlock — span mode", () => {
  it("returns 0 when value <= min", () => {
    expect(spanOrBlock("0", ["24000", "12000"], true)).toBe(0);
    expect(spanOrBlock("12000", ["24000", "12000"], true)).toBe(0);
  });
  it("returns 100 when value >= max", () => {
    expect(spanOrBlock("24000", ["24000", "12000"], true)).toBe(100);
    expect(spanOrBlock("30000", ["24000", "12000"], true)).toBe(100);
  });
  it("interpolates linearly between min and max", () => {
    // value 18000, span 12000, normalized 6000 → 50%
    expect(spanOrBlock("18000", ["24000", "12000"], true)).toBe(50);
  });
  it("works regardless of bound order in input", () => {
    expect(spanOrBlock("18000", ["12000", "24000"], true)).toBe(50);
  });
});

describe("spanOrBlock — block mode", () => {
  it("scores 100 for value at or below the lowest threshold", () => {
    // sorted desc: [100, 50, 10]; val=5 → first sorted[i]>=val is i=2 (10)
    // The V1 loop scans descending and the first sorted[i] >= val gives index.
    // With sorted desc [100,50,10] and val=5: sorted[0]=100>=5 → index=0 → score 100.
    expect(spanOrBlock("5", ["10", "50", "100"], false)).toBe(100);
  });
  it("scores 0 for value above every threshold", () => {
    // val=200: never matches; index = length = 3 → 100 - 3*(100/3) = 0
    expect(spanOrBlock("200", ["10", "50", "100"], false)).toBe(0);
  });
});

describe("normalizeDateSpan", () => {
  it("passes through when min is non-negative", () => {
    const r = normalizeDateSpan(50, 100, 0);
    expect(r.value).toBe("50");
    expect(r.bounds).toEqual(["100", "0"]);
  });

  it("reflects values into [0, range] when min is negative", () => {
    // tier ["7", "-365"], days = -200:
    //   range = 7 - (-365) = 372
    //   reflected = 372 - (-200 - (-365)) = 372 - 165 = 207
    const r = normalizeDateSpan(-200, 7, -365);
    expect(r.value).toBe("207");
    expect(r.bounds).toEqual(["372", "0"]);
  });

  it("after reflection, earliest dates score highest", () => {
    // V1 semantics: with span ["7","-365"], a date 365 days in the past
    // should score nearly 100 (most stale wins).
    const r = normalizeDateSpan(-365, 7, -365);
    expect(r.value).toBe("372"); // pinned to the upper bound
  });
});
