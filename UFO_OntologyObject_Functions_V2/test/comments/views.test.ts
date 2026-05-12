import { describe, expect, it } from "vitest";
import {
  countByCode,
  filterByCode,
  mostRecent,
  renderCommentMarkdown,
  renderLinkedMarkdown,
  summarizeCounts,
} from "../../src/comments/views.js";
import { COMMENT_USERS } from "../../src/comments/dictionary.js";
import {
  NICK_AT,
  NICK_UUID,
  TS_MID,
  TS_NEW,
  TS_OLD,
  sampleComments,
  sampleLinked,
} from "./fixtures.js";

describe("filterByCode", () => {
  it("keeps only the requested code", () => {
    expect(filterByCode(sampleComments, "Parts")).toHaveLength(1);
    expect(filterByCode(sampleComments, "Technical")).toHaveLength(1);
    expect(filterByCode(sampleComments, "Customer Support")).toHaveLength(1);
  });
});

describe("mostRecent", () => {
  it("returns the highest-timestamp item", () => {
    const recent = mostRecent(sampleComments);
    expect(recent?.code).toBe("Customer Support");
  });

  it("returns undefined for an empty input", () => {
    expect(mostRecent([])).toBeUndefined();
  });
});

describe("countByCode", () => {
  it("buckets each comment under its code", () => {
    const counts = countByCode(sampleComments, [], "81000002");
    expect(counts).toEqual({
      parts: 1,
      technical: 1,
      customerSupport: 1,
      linked: 0,
    });
  });

  it("excludes comments older than the since threshold", () => {
    const counts = countByCode(sampleComments, [], "81000002", TS_MID + 1);
    expect(counts.parts).toBe(0);
    expect(counts.technical).toBe(0);
    expect(counts.customerSupport).toBe(1);
  });

  it("filters linked comments by current dossier id", () => {
    // sample.sampleLinked has two from 81000001 and one from 81000099.
    // From the perspective of 81000001, only the foreign one counts.
    const counts = countByCode(
      [],
      sampleLinked,
      "81000001",
    );
    expect(counts.linked).toBe(1);
  });

  it("excludes linked comments older than the since threshold", () => {
    const counts = countByCode([], sampleLinked, "81000002", TS_NEW);
    expect(counts.linked).toBe(1); // only the TS_NEW one survives
  });
});

describe("summarizeCounts", () => {
  it("returns empty string when everything is zero", () => {
    expect(
      summarizeCounts({ parts: 0, technical: 0, customerSupport: 0, linked: 0 }),
    ).toBe("");
  });

  it("formats counts in the V1-equivalent string", () => {
    const summary = summarizeCounts({
      parts: 2,
      technical: 1,
      customerSupport: 0,
      linked: 3,
    });
    expect(summary).toContain("Parts: 2");
    expect(summary).toContain("Tech: 1");
    expect(summary).toContain("CS: 0");
    expect(summary).toContain("Link: 3");
  });
});

describe("renderCommentMarkdown", () => {
  it("flags comments newer than `newSince` with == markers", () => {
    const md = renderCommentMarkdown(sampleComments, { newSince: TS_MID });
    // TS_OLD is older → no flag; TS_MID and TS_NEW are at-or-after → flagged.
    expect(md).toMatch(/Luis Bowen/); // the unflagged author still appears
    // Each comment opens with one '#### ' header.
    expect((md.match(/^#### /gm) ?? []).length).toBe(sampleComments.length);
    // The two newer-than-TS_MID comments should be flagged with the ==
    // marker, but the TS_OLD comment from Luis Bowen should not.
    expect(md).toMatch(/==.*-Marion Albouy==/);
    expect(md).toMatch(/==.*-Asim Cheema==/);
    expect(md).not.toMatch(/==.*-Luis Bowen==/);
  });

  it("resolves UUID mentions when a users map is supplied", () => {
    const md = renderCommentMarkdown(sampleComments, { users: COMMENT_USERS });
    expect(md).toContain(NICK_AT);
    expect(md).not.toContain(NICK_UUID);
  });

  it("sorts newest-first when asked", () => {
    const md = renderCommentMarkdown(sampleComments, { sortDescending: true });
    // The first author header should be the newest comment (Asim Cheema).
    const firstHeader = md.split("####")[1];
    expect(firstHeader).toContain("Asim Cheema");
  });

  it("emits empty output for an empty input", () => {
    expect(renderCommentMarkdown([])).toBe("");
  });
});

describe("renderLinkedMarkdown", () => {
  it("filters comments whose source dossier matches the current entry", () => {
    const md = renderLinkedMarkdown(sampleLinked, "81000001");
    // 81000001's own two contributions are excluded; only 81000099 remains.
    expect(md).toContain("81000099");
    expect(md).not.toContain("dossier A");
  });

  it("shows every linked comment when current dossier is something unrelated", () => {
    const md = renderLinkedMarkdown(sampleLinked, "81999999");
    expect(md).toContain("81000001");
    expect(md).toContain("81000099");
  });

  it("respects newSince flagging", () => {
    const md = renderLinkedMarkdown(sampleLinked, "81999999", {
      newSince: TS_OLD + 1,
    });
    expect(md).toContain("==");
  });
});
