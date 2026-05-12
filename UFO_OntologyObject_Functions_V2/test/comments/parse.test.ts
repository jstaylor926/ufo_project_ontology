import { describe, expect, it } from "vitest";
import {
  parseEntryComment,
  parseLinkedComment,
  parseTeamComment,
  resolveMentions,
  toEntryComment,
  toLinkedComment,
  toTeamComment,
} from "../../src/comments/parse.js";
import { COMMENT_USERS } from "../../src/comments/dictionary.js";
import { NICK_AT, NICK_UUID, sampleComments } from "./fixtures.js";

describe("parseEntryComment", () => {
  it("parses a millis-timestamped entry comment", () => {
    const c = parseEntryComment("1700000000000.Luis Bowen.Parts.body text");
    expect(c).not.toBeNull();
    expect(c!.timestamp).toBe(1700000000000);
    expect(c!.authorDisplay).toBe("Luis Bowen");
    expect(c!.code).toBe("Parts");
    expect(c!.body).toBe("body text");
  });

  it("parses an ISO-timestamped entry comment", () => {
    const c = parseEntryComment("2024-06-15T08:30:00Z.Marion.Technical.body");
    expect(c).not.toBeNull();
    expect(c!.timestamp).toBe(Date.parse("2024-06-15T08:30:00Z"));
    expect(c!.code).toBe("Technical");
  });

  it("preserves dots inside the body", () => {
    const c = parseEntryComment(
      "1700000000000.Author.Parts.body with dots. and more. dots.",
    );
    expect(c!.body).toBe("body with dots. and more. dots.");
  });

  it("returns null on malformed input", () => {
    expect(parseEntryComment("")).toBeNull();
    expect(parseEntryComment("just one dot.")).toBeNull();
    expect(parseEntryComment("two.dots.but no body")).toBeNull();
    expect(parseEntryComment("bad.timestamp.Parts.body")).toBeNull();
  });

  it("rejects unknown code values", () => {
    expect(
      parseEntryComment("1700000000000.Author.NotARealCode.body"),
    ).toBeNull();
  });
});

describe("toEntryComment / round-trip", () => {
  it("round-trips every fixture", () => {
    for (const c of sampleComments) {
      const serialized = toEntryComment(c);
      const parsed = parseEntryComment(serialized);
      expect(parsed).not.toBeNull();
      expect(parsed!.timestamp).toBe(c.timestamp);
      expect(parsed!.authorDisplay).toBe(c.authorDisplay);
      expect(parsed!.code).toBe(c.code);
      expect(parsed!.body).toBe(c.body);
    }
  });
});

describe("parseLinkedComment", () => {
  it("parses a linked comment with a short dossier id", () => {
    const lc = parseLinkedComment("81000001.1700000000000.linked body");
    expect(lc).not.toBeNull();
    expect(lc!.sourceDossierId).toBe("81000001");
    expect(lc!.timestamp).toBe(1700000000000);
    expect(lc!.body).toBe("linked body");
  });

  it("rejects an oversized dossier id (V1 rule: ≤ 9 chars)", () => {
    expect(parseLinkedComment("THISisTOOLONG.1700000000000.body")).toBeNull();
  });

  it("round-trips toLinkedComment", () => {
    const c = sampleComments[1];
    const raw = toLinkedComment("81000001", c);
    const parsed = parseLinkedComment(raw);
    expect(parsed!.sourceDossierId).toBe("81000001");
    expect(parsed!.timestamp).toBe(c.timestamp);
    expect(parsed!.body).toBe(c.body);
  });
});

describe("parseTeamComment", () => {
  it("parses the five-field %* format", () => {
    const raw = "1700000000000%*81234567%*Luis%*Parts%*body";
    const tc = parseTeamComment(raw);
    expect(tc).not.toBeNull();
    expect(tc!.sourceDossierId).toBe("81234567");
    expect(tc!.authorDisplay).toBe("Luis");
    expect(tc!.code).toBe("Parts");
    expect(tc!.body).toBe("body");
  });

  it("preserves %* inside the body field", () => {
    const c = sampleComments[0];
    const serialized = toTeamComment(
      { ...c, body: "split%*body%*here" },
      "81234567",
    );
    const parsed = parseTeamComment(serialized);
    expect(parsed!.body).toBe("split%*body%*here");
  });
});

describe("resolveMentions", () => {
  it("replaces a known UUID with its display form", () => {
    const out = resolveMentions(`Hello ${NICK_UUID}`, COMMENT_USERS);
    expect(out).toBe(`Hello ${NICK_AT}`);
  });

  it("leaves an unknown UUID alone", () => {
    const alien = "00000000-0000-0000-0000-000000000000";
    const out = resolveMentions(`Hello ${alien}`, COMMENT_USERS);
    expect(out).toBe(`Hello ${alien}`);
  });

  it("handles multiple mentions in one body", () => {
    const out = resolveMentions(
      `${NICK_UUID} and again ${NICK_UUID}`,
      COMMENT_USERS,
    );
    expect(out).toBe(`${NICK_AT} and again ${NICK_AT}`);
  });
});
