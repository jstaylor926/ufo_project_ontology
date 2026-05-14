import { describe, expect, it } from "vitest";
import { recentEscalations } from "../../src/reporting/escalations.js";
import { REPORT_WINDOW_MS, type ReportEscalation } from "../../src/reporting/types.js";

const NOW = Date.UTC(2026, 4, 14, 12, 0, 0); // 2026-05-14T12:00:00Z

function esc(raisedAtMs: number | undefined, label = "e"): ReportEscalation {
  return {
    raisedAtMs,
    user: label,
    escalationType: "Internal",
    dossierId: "D1",
  };
}

describe("recentEscalations", () => {
  it("keeps an escalation raised inside the 24h window", () => {
    const result = recentEscalations(
      [esc(NOW - 60 * 60 * 1000, "1h-ago")],
      NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].user).toBe("1h-ago");
  });

  it("drops an escalation older than 24h", () => {
    const result = recentEscalations(
      [esc(NOW - REPORT_WINDOW_MS - 1, "stale")],
      NOW,
    );
    expect(result).toEqual([]);
  });

  it("treats the 24h boundary as exclusive (V1 used >, we match)", () => {
    // raisedAt == cutoff is rejected, raisedAt == cutoff+1 is kept.
    const cutoff = NOW - REPORT_WINDOW_MS;
    expect(recentEscalations([esc(cutoff)], NOW)).toEqual([]);
    expect(recentEscalations([esc(cutoff + 1)], NOW)).toHaveLength(1);
  });

  it("drops escalations with undefined raisedAtMs", () => {
    expect(recentEscalations([esc(undefined)], NOW)).toEqual([]);
  });

  it("preserves input order", () => {
    const result = recentEscalations(
      [esc(NOW - 1000, "first"), esc(NOW - 2000, "second"), esc(NOW - 3000, "third")],
      NOW,
    );
    expect(result.map((e) => e.user)).toEqual(["first", "second", "third"]);
  });

  it("returns [] for an empty input", () => {
    expect(recentEscalations([], NOW)).toEqual([]);
  });

  it("catches an escalation raised after yesterday midnight (V1 bug-fix)", () => {
    // The V1 LocalDate.now()-based filter would drop this entry when the
    // report fires shortly after midnight. The V2 24h window keeps it.
    const reportFire = Date.UTC(2026, 4, 14, 1, 0, 0); // 1am
    const yesterdayEvening = Date.UTC(2026, 4, 13, 20, 0, 0); // yesterday 8pm
    const result = recentEscalations(
      [esc(yesterdayEvening, "yesterday-evening")],
      reportFire,
    );
    expect(result).toHaveLength(1);
  });
});
