import { describe, expect, it } from "vitest";
import {
  addFavorites,
  isFavoriteOf,
  removeFavorites,
} from "../../src/fsr/favorites.js";
import { DOSSIER_A, DOSSIER_B, DOSSIER_C } from "./fixtures.js";

describe("addFavorites", () => {
  it("seeds a fresh list when current is undefined", () => {
    expect(addFavorites(undefined, [DOSSIER_A, DOSSIER_B])).toEqual([
      DOSSIER_A,
      DOSSIER_B,
    ]);
  });

  it("seeds a fresh list when current is empty", () => {
    expect(addFavorites([], [DOSSIER_A])).toEqual([DOSSIER_A]);
  });

  it("appends genuinely new ids in input order", () => {
    expect(addFavorites([DOSSIER_A], [DOSSIER_B, DOSSIER_C])).toEqual([
      DOSSIER_A,
      DOSSIER_B,
      DOSSIER_C,
    ]);
  });

  it("no-ops when every new id is already present (preserve order)", () => {
    expect(addFavorites([DOSSIER_A, DOSSIER_B], [DOSSIER_B, DOSSIER_A])).toEqual(
      [DOSSIER_A, DOSSIER_B],
    );
  });

  it("de-dupes within the new-ids batch itself", () => {
    expect(addFavorites([], [DOSSIER_A, DOSSIER_A, DOSSIER_B])).toEqual([
      DOSSIER_A,
      DOSSIER_B,
    ]);
  });

  it("preserves the existing order on partial overlap", () => {
    expect(
      addFavorites([DOSSIER_A, DOSSIER_B], [DOSSIER_B, DOSSIER_C]),
    ).toEqual([DOSSIER_A, DOSSIER_B, DOSSIER_C]);
  });
});

describe("removeFavorites", () => {
  it("returns [] when current is undefined", () => {
    expect(removeFavorites(undefined, [DOSSIER_A])).toEqual([]);
  });

  it("removes a single id", () => {
    expect(
      removeFavorites([DOSSIER_A, DOSSIER_B, DOSSIER_C], [DOSSIER_B]),
    ).toEqual([DOSSIER_A, DOSSIER_C]);
  });

  it("removes multiple ids in one pass", () => {
    expect(
      removeFavorites([DOSSIER_A, DOSSIER_B, DOSSIER_C], [DOSSIER_A, DOSSIER_C]),
    ).toEqual([DOSSIER_B]);
  });

  it("ignores ids that are not present (idempotent)", () => {
    expect(removeFavorites([DOSSIER_A], [DOSSIER_B])).toEqual([DOSSIER_A]);
  });

  it("preserves the order of the remaining ids", () => {
    expect(
      removeFavorites([DOSSIER_A, DOSSIER_B, DOSSIER_C], [DOSSIER_B]),
    ).toEqual([DOSSIER_A, DOSSIER_C]);
  });
});

describe("isFavoriteOf", () => {
  it("returns true when the dossier is in favorites", () => {
    expect(isFavoriteOf([DOSSIER_A, DOSSIER_B], DOSSIER_A)).toBe(true);
  });

  it("returns false when the dossier is not in favorites", () => {
    expect(isFavoriteOf([DOSSIER_A], DOSSIER_B)).toBe(false);
  });

  it("returns false when favorites is undefined", () => {
    expect(isFavoriteOf(undefined, DOSSIER_A)).toBe(false);
  });

  it("returns false when dossierId is undefined", () => {
    expect(isFavoriteOf([DOSSIER_A], undefined)).toBe(false);
  });

  it("returns false when both inputs are undefined", () => {
    expect(isFavoriteOf(undefined, undefined)).toBe(false);
  });
});
