import { describe, expect, it } from "vitest";
import { groupRecentTeamComments } from "../../src/reporting/comments.js";
import { REPORT_WINDOW_MS } from "../../src/reporting/types.js";

const NOW = Date.UTC(2026, 4, 14, 12, 0, 0);

function teamRaw(
  ts: number,
  dossierId: string,
  author: string,
  code: string,
  body: string,
): string {
  return [ts, dossierId, author, code, body].join("%*");
}

describe("groupRecentTeamComments", () => {
  it("groups multiple comments under their dossier id", () => {
    const raw = [
      teamRaw(NOW - 1000, "D1", "alice", "Technical", "engine check"),
      teamRaw(NOW - 2000, "D1", "bob", "Parts", "part-A ordered"),
      teamRaw(NOW - 3000, "D2", "alice", "Customer Support", "called op"),
    ];
    const result = groupRecentTeamComments(raw, NOW);
    expect(result.get("D1")).toEqual([
      "alice (Technical): engine check",
      "bob (Parts): part-A ordered",
    ]);
    expect(result.get("D2")).toEqual(["alice (Customer Support): called op"]);
  });

  it("drops comments older than 24h", () => {
    const raw = [
      teamRaw(NOW - REPORT_WINDOW_MS - 1, "D1", "alice", "Technical", "stale"),
    ];
    expect(groupRecentTeamComments(raw, NOW).size).toBe(0);
  });

  it("treats the 24h boundary as exclusive (V1 used >, we match)", () => {
    const cutoff = NOW - REPORT_WINDOW_MS;
    expect(
      groupRecentTeamComments(
        [teamRaw(cutoff, "D1", "a", "Technical", "x")],
        NOW,
      ).size,
    ).toBe(0);
    expect(
      groupRecentTeamComments(
        [teamRaw(cutoff + 1, "D1", "a", "Technical", "x")],
        NOW,
      ).size,
    ).toBe(1);
  });

  it("skips malformed rows silently", () => {
    const raw = [
      "not%*enough",
      teamRaw(NOW - 1000, "D1", "alice", "Technical", "ok"),
    ];
    const result = groupRecentTeamComments(raw, NOW);
    expect(result.get("D1")).toEqual(["alice (Technical): ok"]);
  });

  it("skips rows with an unknown code", () => {
    const raw = [teamRaw(NOW - 1000, "D1", "alice", "Bogus", "x")];
    expect(groupRecentTeamComments(raw, NOW).size).toBe(0);
  });

  it("preserves dossier insertion order", () => {
    const raw = [
      teamRaw(NOW - 1000, "Z", "a", "Technical", "z first"),
      teamRaw(NOW - 1100, "A", "a", "Technical", "a second"),
      teamRaw(NOW - 1200, "M", "a", "Technical", "m third"),
    ];
    const result = groupRecentTeamComments(raw, NOW);
    expect([...result.keys()]).toEqual(["Z", "A", "M"]);
  });

  it("returns an empty map for undefined input", () => {
    expect(groupRecentTeamComments(undefined, NOW).size).toBe(0);
  });

  it("returns an empty map for empty input", () => {
    expect(groupRecentTeamComments([], NOW).size).toBe(0);
  });
});
