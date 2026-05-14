import { describe, expect, it } from "vitest";
import { isInactive } from "../../src/fsr/identity.js";
import { ACTIVE_LOGIN, INACTIVE_LOGIN, NOW, ONE_YEAR_MS } from "./fixtures.js";

describe("isInactive", () => {
  it("returns true when last login is older than one year", () => {
    expect(isInactive(NOW, INACTIVE_LOGIN)).toBe(true);
  });

  it("returns false when last login is recent", () => {
    expect(isInactive(NOW, ACTIVE_LOGIN)).toBe(false);
  });

  it("returns false at exactly the one-year boundary (strict >)", () => {
    expect(isInactive(NOW, NOW - ONE_YEAR_MS)).toBe(false);
  });

  it("returns true one millisecond past the one-year boundary", () => {
    expect(isInactive(NOW, NOW - ONE_YEAR_MS - 1)).toBe(true);
  });

  it("returns false when lastLogIn is undefined (skip policy)", () => {
    expect(isInactive(NOW, undefined)).toBe(false);
  });

  it("returns false when last login is in the future (clock skew)", () => {
    expect(isInactive(NOW, NOW + ONE_YEAR_MS)).toBe(false);
  });
});
