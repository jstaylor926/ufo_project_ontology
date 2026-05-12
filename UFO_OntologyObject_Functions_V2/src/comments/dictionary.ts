/**
 * UUID → display-name dictionary used to resolve @-mentions inside comment
 * bodies. The V1 module stored this as a `Record<string, string>`; we
 * promote it to a `ReadonlyMap` so callers cannot mutate it and so
 * iteration order is preserved for deterministic markdown rendering.
 */

const RAW: Record<string, string> = {
  "67c35074-edd0-4eb0-b7d5-f5d1b1d38054": "`@Nick Petersen`",
  "4069558b-f794-435d-ad2d-aafde819ece2": "`@Moni Mejia de Smith`",
  "8d76ac2f-3645-40cb-9e77-c8ce3ad74eef": "`@Daniel Williams`",
  "93536463-84f3-4bd7-b402-c2d3279cfea1": "`@Debra Boline`",
  "8b25c9b9-631d-48f8-a44c-ac4ecb3cce34": "`@Juan Jimenez Jimenez`",
  "7d67ba27-b595-45d0-96bb-ea5db066eede": "`@Rahul Kapoor`",
  "991c0175-10d8-447f-98cb-b5dc2192d168": "`@Erin Kotlarczyk`",
  "b433befc-c614-452a-9d70-aadf9b0f5dee": "`@Javier MEDINA PUIN`",
  "ded6f643-a610-47dd-b821-9c08370768bc": "`@Velin Penkov DIMITROV`",
  "aaded60c-284e-44a6-b865-99bb84c87686": "`@CHRISTOPHE MARTIN`",
  "6a94d8a5-9611-445f-8bb3-6d26a156f1ba": "`@MARION ALBOUY`",
  "87338f7f-a9d6-4c15-82ce-7187e63dfb13": "`@FABIEN TURPAUD`",
  "21ae085f-4b91-414e-8c29-1ea50807919c": "`@PAUL TAYLOR`",
  "14a434b9-e032-4e38-83d4-9004640d0246": "`@GILLES CANNAUD RIBES`",
  "29d9afba-22d7-462e-83d7-123dff42971e": "`@Christophe Vandenbussche`",
  "9766ba9c-4df6-4df5-8681-4922e7a24d05": "`@Antoine Gouyet`",
  "75612cb3-8950-4634-9af2-57dfdfe7d360": "`@JEANNE PLANTINET`",
  "327a8eef-e98f-4d63-8f03-fc28bb7554ce": "`@Rudy Quevedo`",
  "9bf4026a-7b7b-4149-9cc3-872706112208": "`@Collyer Burbach`",
  "3250c190-85de-4ff3-9aa4-24436caf0d9d": "`@Simon Pickup`",
  "4a958982-de5a-4fb9-a9a2-bc2645ce8294": "`@Pascale Armengol`",
  "add5c8f5-fc42-4655-891a-35f905183c8d": "`@FREDERIC DIU`",
  "bfb6c605-5d62-49f8-9199-4a3a0a4e28f4": "`@Yilikal ASRES`",
  "e736c7d8-f43b-4b8e-87c4-a9fd6430c3a9": "`@STEPHANE LAFFITTE`",
  "5fdaec41-a6d5-4c13-a3a6-6d7b77adc88c": "`@Markus Peter Grütgen`",
  "c26042be-32f0-4aae-a589-3d8abfa53117": "`@Jeff Hutchinson`",
  "d23a312d-04ad-4321-b3a2-4cadd03f6769": "`@Asim CHEEMA`",
};

export const COMMENT_USERS: ReadonlyMap<string, string> = new Map(
  Object.entries(RAW),
);
