// The two decisions that make coins add up, kept clear of Firebase so they can
// be tested — and read — on their own. `src/data/entries.ts` re-exports them.

import type { Entry, EntryStatus, Task } from "../types";

/**
 * A task marked `needsApproval` lands as `pending` and pays nothing until a
 * parent decides; anything else pays on the spot.
 */
export function statusForTask(task: Pick<Task, "needsApproval">): EntryStatus {
  return task.needsApproval ? "pending" : "approved";
}

/**
 * Coins to give back when an entry is undone. Only an approved entry ever paid
 * out, so undoing a pending or rejected one must not move the balance — that
 * bug spends coins the child never received.
 */
export function coinDeltaForUndo(entry: Pick<Entry, "status" | "coin">): number {
  return entry.status === "approved" ? -entry.coin : 0;
}
