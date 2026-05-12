/**
 * Reusable test fixtures for the Comments V2 spike.
 */
import type { CommentEntry, LinkedCommentEntry } from "../../src/comments/types.js";

export const TS_OLD = Date.UTC(2024, 0, 1, 12, 0, 0); // 2024-01-01 12:00 UTC
export const TS_MID = Date.UTC(2024, 5, 15, 8, 30, 0); // 2024-06-15 08:30 UTC
export const TS_NEW = Date.UTC(2024, 11, 31, 22, 45, 0); // 2024-12-31 22:45 UTC

export const NICK_UUID = "67c35074-edd0-4eb0-b7d5-f5d1b1d38054";
export const NICK_AT = "`@Nick Petersen`";

export const sampleComments: CommentEntry[] = [
  {
    timestamp: TS_OLD,
    authorUuid: "",
    authorDisplay: "Luis Bowen",
    code: "Parts",
    body: "Spare part ordered, ETA 2 weeks",
    isLinked: false,
    linkedMsnIds: [],
  },
  {
    timestamp: TS_MID,
    authorUuid: "",
    authorDisplay: "Marion Albouy",
    code: "Technical",
    body: `Reviewed RDAF; cc ${NICK_UUID}`,
    isLinked: true,
    linkedMsnIds: [4030, 4296],
  },
  {
    timestamp: TS_NEW,
    authorUuid: "",
    authorDisplay: "Asim Cheema",
    code: "Customer Support",
    body: "Operator requests interim TD",
    isLinked: false,
    linkedMsnIds: [],
  },
];

export const sampleLinked: LinkedCommentEntry[] = [
  {
    timestamp: TS_OLD,
    sourceDossierId: "81000001",
    body: "Comment from sibling dossier A",
  },
  {
    timestamp: TS_MID,
    sourceDossierId: "81000001", // same source — would be filtered out
    body: "Another comment from sibling A",
  },
  {
    timestamp: TS_NEW,
    sourceDossierId: "81000099",
    body: "Comment from sibling dossier B",
  },
];
