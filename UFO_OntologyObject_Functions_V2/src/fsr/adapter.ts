/**
 * FSR V2 — Foundry adapter.
 *
 * Wires the pure functions in `identity.ts` and `favorites.ts` to the
 * ontology runtime. Each method is a thin shim: pull V1/V2 fields off
 * `UfoFsr` / `Ufoentry`, defer to pure logic, write back through the
 * ontology API.
 *
 * Phase-4 FBP / Action bindings (Ontology Spec §6.3):
 *
 *   Action / Function         ←  adapter method
 *   pruneInactiveFsrs            scanAndDelete
 *   scenarioFSRMatch             scenarioFSRMatch          (now pure @Function)
 *   scenarioDriverandReturnFSRFav scenarioDriverandReturnFSRFav
 *   addFavorite                  addAndUpdateFSRFavs
 *   removeFavorite               removeAndUpdateFSRFavs
 *
 * V1 → V2 deltas worth noting:
 *   - `currentLogIn` renamed to `lastLogIn` (Ontology Spec §4.3).
 *   - `scanAndDelete` actually deletes now (V1 had an inverted-operands bug).
 *   - Missing `lastLogIn` is a SKIP, not a stamp-and-defer.
 *   - `scenarioFSRMatch` no longer mutates `entry.isFavorite`; it returns a
 *     `FunctionsMap<Ufoentry, boolean>`. Workshop bindings that consumed
 *     the scenario-side mutation must repoint to the function output.
 */

import {
  Edits,
  Function,
  FunctionsMap,
  OntologyEditFunction,
  Timestamp,
} from "@foundry/functions-api";
import {
  Objects,
  Ufoentry,
  UfoFsr,
  type ObjectSet,
} from "@foundry/ontology-api";
import { isInactive } from "./identity.js";
import {
  addFavorites,
  isFavoriteOf,
  removeFavorites,
} from "./favorites.js";

/** Pull `idDossier` off a set of entries, dropping any that are missing one. */
function entryIds(entries: ObjectSet<Ufoentry>): string[] {
  return entries
    .all()
    .map((e) => e.idDossier)
    .filter((id): id is string => id !== undefined);
}

export class FSRFunctionsV2 {
  /**
   * Replaces V1 `scanandDelete`.
   *
   * Deletes any `UfoFsr` whose `lastLogIn` is older than one year. FSRs
   * without a `lastLogIn` are skipped (see `identity.ts` for rationale).
   */
  @OntologyEditFunction()
  @Edits(UfoFsr)
  public scanAndDelete(): void {
    const nowMs = Timestamp.now().valueOf();
    for (const f of Objects.search().ufoFsr().all()) {
      const lastMs = f.lastLogIn?.valueOf();
      if (isInactive(nowMs, lastMs)) {
        f.delete();
      }
    }
  }

  /**
   * Replaces V1 `scenarioFSRMatch`.
   *
   * Returns a per-entry boolean: `true` if the entry's `idDossier` is in
   * `fsr.favorites`. Pure read — no edits, scenario-safe.
   */
  @Function()
  public scenarioFSRMatch(
    fsr: UfoFsr,
    entries: ObjectSet<Ufoentry>,
  ): FunctionsMap<Ufoentry, boolean> {
    const favorites = fsr.favorites;
    const out = new FunctionsMap<Ufoentry, boolean>();
    for (const e of entries.all()) {
      out.set(e, isFavoriteOf(favorites, e.idDossier));
    }
    return out;
  }

  /**
   * Replaces V1 `scenarioDriverandReturnFSRFav`.
   *
   * Returns just the subset of entries that match the FSR's favorites.
   * Drives the "Show only my favorites" scenario widget.
   */
  @Function()
  public scenarioDriverandReturnFSRFav(
    fsr: UfoFsr,
    entries: ObjectSet<Ufoentry>,
  ): Ufoentry[] {
    const favorites = fsr.favorites;
    return entries.all().filter((e) => isFavoriteOf(favorites, e.idDossier));
  }

  /**
   * Replaces V1 `addAndupdateFSRFavs`.
   *
   * Appends each entry's `idDossier` to `fsr.favorites`. Already-present
   * IDs are no-ops (idempotent under retries). Entries with an undefined
   * `idDossier` are silently dropped at the adapter boundary.
   */
  @OntologyEditFunction()
  @Edits(UfoFsr)
  public addAndUpdateFSRFavs(
    fsr: UfoFsr,
    entriesToAdd: ObjectSet<Ufoentry>,
  ): void {
    if (fsr == null) {
      throw new Error("addAndUpdateFSRFavs: fsr is required");
    }
    fsr.favorites = addFavorites(fsr.favorites, entryIds(entriesToAdd));
  }

  /**
   * Replaces V1 `removeAndupdateFSRFavs`.
   *
   * Removes each entry's `idDossier` from `fsr.favorites`. Missing IDs are
   * no-ops. Idempotent under retries.
   */
  @OntologyEditFunction()
  @Edits(UfoFsr)
  public removeAndUpdateFSRFavs(
    fsr: UfoFsr,
    entriesToRemove: ObjectSet<Ufoentry>,
  ): void {
    if (fsr == null) {
      throw new Error("removeAndUpdateFSRFavs: fsr is required");
    }
    fsr.favorites = removeFavorites(fsr.favorites, entryIds(entriesToRemove));
  }
}
