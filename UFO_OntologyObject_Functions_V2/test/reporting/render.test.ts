import { describe, expect, it } from "vitest";
import {
  renderCommentDigest,
  renderEscalationList,
  renderReportBody,
} from "../../src/reporting/render.js";
import type { ReportEscalation } from "../../src/reporting/types.js";

const esc = (
  user: string,
  escalationType: string,
  dossierId: string,
): ReportEscalation => ({
  raisedAtMs: 0,
  user,
  escalationType,
  dossierId,
});

describe("renderEscalationList", () => {
  it("renders V1's <ul> envelope with inline styles", () => {
    const out = renderEscalationList([]);
    expect(out).toBe(
      '<ul style="list-style-position: inside; padding-left: 0; margin-left: 0;"></ul>',
    );
  });

  it("emits one <li> per escalation with V1 wording", () => {
    const out = renderEscalationList([esc("alice", "Internal", "D1")]);
    expect(out).toContain("<li> <i>alice</i> requested a(n) Internal escalation on <b> Dossier D1</b> </li>");
  });

  it("trims the user display name (matches V1)", () => {
    const out = renderEscalationList([esc("  alice  ", "Internal", "D1")]);
    expect(out).toContain("<i>alice</i>");
    expect(out).not.toContain("<i>  alice  </i>");
  });

  it("preserves input order across multiple entries", () => {
    const out = renderEscalationList([
      esc("first", "Internal", "D1"),
      esc("second", "Customer", "D2"),
    ]);
    expect(out.indexOf("first")).toBeLessThan(out.indexOf("second"));
  });
});

describe("renderCommentDigest", () => {
  it("renders an empty <table> when there are no dossiers", () => {
    const out = renderCommentDigest(new Map());
    expect(out).toBe(
      "<div><table style='border-collapse: collapse;'><tbody></tbody></table></div>",
    );
  });

  it("renders one row per dossier with an <h2> and a nested <ul>", () => {
    const m = new Map<string, string[]>([
      ["D1", ["alice (Technical): engine check", "bob (Parts): part-A"]],
    ]);
    const out = renderCommentDigest(m);
    expect(out).toContain("<h2>D1</h2>");
    expect(out).toContain("<li>alice (Technical): engine check</li>");
    expect(out).toContain("<li>bob (Parts): part-A</li>");
  });

  it("preserves Map insertion order across rows", () => {
    const m = new Map<string, string[]>([
      ["Z", ["z-line"]],
      ["A", ["a-line"]],
    ]);
    const out = renderCommentDigest(m);
    expect(out.indexOf("<h2>Z</h2>")).toBeLessThan(out.indexOf("<h2>A</h2>"));
  });
});

describe("renderReportBody", () => {
  it("concatenates escalations then comments", () => {
    const escalations = [esc("alice", "Internal", "D1")];
    const m = new Map<string, string[]>([["D1", ["alice (Technical): hi"]]]);
    const out = renderReportBody(escalations, m);
    expect(out.indexOf("<ul")).toBeLessThan(out.indexOf("<table"));
    expect(out).toContain("alice");
    expect(out).toContain("D1");
  });
});
