/**
 * Restoration V2 — Foundry adapter.
 *
 * Decorated entry points that the Workshop "Restore Filters" widget
 * binds to. All four V1 methods are `@Function` (read-only).
 *
 * The V1 `filterChange` body was 9 copy-pasted sort-and-compare blocks
 * over hard-coded field names; V2 collapses it to a loop over an
 * `(A, B)` pair list, calling the pure `arraysEqualUnordered` helper
 * once per field. The 18-argument call signature is preserved verbatim
 * so existing Workshop bindings keep working — refactoring the call
 * shape is a separate concern.
 */

import { Function, type Integer } from "@foundry/functions-api";
import {
  arraysEqualUnordered,
  ensureStringArray,
  toIntegerArray,
} from "./arrays.js";

export class RestorationV2 {
  /** Replaces V1 `returnRestoredList`. */
  @Function()
  public returnRestoredList(list: string[]): string[] {
    return ensureStringArray(list);
  }

  /** Replaces V1 `returnRestoredList_number`. */
  @Function()
  public returnRestoredListNumber(list: string[]): Integer[] {
    return toIntegerArray(list);
  }

  /**
   * Replaces V1 `filterChange`. Returns true if ANY field's "before"
   * and "after" arrays differ (multiset-wise). Preserves the V1
   * 18-positional-arg call signature so Workshop bindings don't churn.
   */
  @Function()
  public filterChange(
    icaoA: string[],
    icaoB: string[],
    trStatusA: string[],
    trStatusB: string[],
    domA: string[],
    domB: string[],
    urgA: string[],
    urgB: string[],
    acA: string[],
    acB: string[],
    engA: string[],
    engB: string[],
    hiddenA: string[],
    hiddenB: string[],
    msnA: string[],
    msnB: string[],
    dossStatA: string[],
    dossStatB: string[],
  ): boolean {
    const pairs: ReadonlyArray<readonly [string[], string[]]> = [
      [icaoA, icaoB],
      [trStatusA, trStatusB],
      [domA, domB],
      [urgA, urgB],
      [acA, acB],
      [engA, engB],
      [hiddenA, hiddenB],
      [msnA, msnB],
      [dossStatA, dossStatB],
    ];
    return pairs.some(([a, b]) => !arraysEqualUnordered(a, b));
  }
}
