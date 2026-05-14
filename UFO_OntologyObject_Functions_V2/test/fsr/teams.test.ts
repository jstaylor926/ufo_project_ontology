import { describe, expect, it } from "vitest";
import { selectTeamMembers, type FsrLite } from "../../src/fsr/teams.js";

const UAL = "UAL";
const DAL = "DAL";

const fsrs: FsrLite[] = [
  { userId: "u1", operatorCode: UAL },
  { userId: "u2", operatorCode: DAL },
  { userId: "u3", operatorCode: UAL },
  { userId: "u4", operatorCode: undefined }, // missing operator → skip
  { userId: undefined, operatorCode: UAL }, // missing userId → skip
];

describe("selectTeamMembers", () => {
  it("returns userIds whose operatorCode matches", () => {
    expect(selectTeamMembers(fsrs, UAL)).toEqual(["u1", "u3"]);
  });

  it("returns a different subset for a different operator", () => {
    expect(selectTeamMembers(fsrs, DAL)).toEqual(["u2"]);
  });

  it("preserves input order", () => {
    expect(selectTeamMembers(
      [
        { userId: "z", operatorCode: UAL },
        { userId: "a", operatorCode: UAL },
        { userId: "m", operatorCode: UAL },
      ],
      UAL,
    )).toEqual(["z", "a", "m"]);
  });

  it("skips FSRs whose operatorCode is undefined", () => {
    const result = selectTeamMembers(fsrs, UAL);
    expect(result).not.toContain("u4");
  });

  it("skips FSRs whose userId is undefined even if operatorCode matches", () => {
    const result = selectTeamMembers(fsrs, UAL);
    expect(result).toHaveLength(2);
  });

  it("returns [] when team operatorCode is undefined", () => {
    expect(selectTeamMembers(fsrs, undefined)).toEqual([]);
  });

  it("returns [] when no FSRs match", () => {
    expect(selectTeamMembers(fsrs, "AAL")).toEqual([]);
  });

  it("returns [] for an empty FSR list", () => {
    expect(selectTeamMembers([], UAL)).toEqual([]);
  });
});
