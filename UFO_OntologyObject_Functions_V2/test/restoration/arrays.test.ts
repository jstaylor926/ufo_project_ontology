import { describe, expect, it } from "vitest";
import {
  arraysEqualUnordered,
  ensureStringArray,
  toIntegerArray,
  toStringArray,
} from "../../src/restoration/arrays.js";

describe("arraysEqualUnordered", () => {
  it("returns true for identical arrays", () => {
    expect(arraysEqualUnordered(["A", "B"], ["A", "B"])).toBe(true);
  });

  it("returns true regardless of order", () => {
    expect(arraysEqualUnordered(["A", "B", "C"], ["C", "A", "B"])).toBe(true);
  });

  it("returns false when lengths differ", () => {
    expect(arraysEqualUnordered(["A"], ["A", "B"])).toBe(false);
  });

  it("returns false when elements differ", () => {
    expect(arraysEqualUnordered(["A", "B"], ["A", "C"])).toBe(false);
  });

  it("treats duplicate counts as significant", () => {
    expect(arraysEqualUnordered(["A", "A", "B"], ["A", "B", "B"])).toBe(false);
  });

  it("returns true for two empty arrays", () => {
    expect(arraysEqualUnordered([], [])).toBe(true);
  });

  it("treats undefined as empty (both undefined)", () => {
    expect(arraysEqualUnordered(undefined, undefined)).toBe(true);
  });

  it("treats undefined as empty (one undefined, one empty)", () => {
    expect(arraysEqualUnordered(undefined, [])).toBe(true);
  });

  it("returns false when one side is undefined and the other has content", () => {
    expect(arraysEqualUnordered(undefined, ["A"])).toBe(false);
  });

  it("does not mutate either input array", () => {
    const a = ["B", "A"];
    const b = ["A", "B"];
    arraysEqualUnordered(a, b);
    expect(a).toEqual(["B", "A"]);
    expect(b).toEqual(["A", "B"]);
  });
});

describe("ensureStringArray", () => {
  it("returns a copy of a present array", () => {
    const input = ["A", "B"];
    const result = ensureStringArray(input);
    expect(result).toEqual(["A", "B"]);
    expect(result).not.toBe(input);
  });

  it("returns an empty array for undefined", () => {
    expect(ensureStringArray(undefined)).toEqual([]);
  });

  it("returns an empty array for an empty input", () => {
    expect(ensureStringArray([])).toEqual([]);
  });
});

describe("toIntegerArray", () => {
  it("parses a list of numeric strings", () => {
    expect(toIntegerArray(["1", "2", "3"])).toEqual([1, 2, 3]);
  });

  it("uses base 10 (no octal surprises with leading zeros)", () => {
    expect(toIntegerArray(["010"])).toEqual([10]);
  });

  it("preserves NaN for unparseable entries (matches V1)", () => {
    const result = toIntegerArray(["1", "foo", "3"]);
    expect(result[0]).toBe(1);
    expect(Number.isNaN(result[1])).toBe(true);
    expect(result[2]).toBe(3);
  });

  it("returns [] for an empty input", () => {
    expect(toIntegerArray([])).toEqual([]);
  });
});

describe("toStringArray", () => {
  it("stringifies numbers", () => {
    expect(toStringArray([1, 2, 3])).toEqual(["1", "2", "3"]);
  });

  it("passes strings through", () => {
    expect(toStringArray(["a", "b"])).toEqual(["a", "b"]);
  });

  it("handles a mixed input", () => {
    expect(toStringArray(["a", 1, "b", 2])).toEqual(["a", "1", "b", "2"]);
  });
});
