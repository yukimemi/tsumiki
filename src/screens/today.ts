// What the Today screen shows, as pure functions over the snapshots the
// screen already holds. No React, no Firestore: the hooks hand in tasks and
// entries, and these decide which rows exist, what state each is in, and in
// what order. Kept pure so the rules a child lives by — what is due, what is
// late, what a rejection means — are testable without a screen.

import { isOverdue, isTaskDueOn } from "../lib/due";
import type { Entry, Task } from "../types";

export type TodayRow = {
  task: Task;
  /** The entry for this (task, member, shown day), when one exists. */
  entry: Entry | null;
  state: "todo" | "pending" | "approved" | "rejected" | "late";
};

/**
 * Actionable rows come first — a bounced-back redo above a fresh todo, both
 * under anything already late — then the ones waiting on a parent, then the
 * decided ones. Within a group the task's own `order` wins, so a row never
 * jumps sideways relative to its siblings when its state changes.
 */
const STATE_RANK: Record<TodayRow["state"], number> = {
  late: 0,
  rejected: 1,
  todo: 2,
  pending: 3,
  approved: 4,
};

/**
 * The rows for one member on one day.
 *
 * `entries` is every entry the screen knows about, not just the shown day's:
 * a `once` task retires the moment it has an `approved` or `pending` entry on
 * ANY date, and only the full set can see that. The shown day's entry is then
 * picked out of the same set to decide the row's state.
 */
export function todayRowsFor(input: {
  tasks: Task[];
  entries: Entry[];
  memberId: string;
  dateKey: string;
  todayKey: string;
  nowHm: string;
}): TodayRow[] {
  const { tasks, entries, memberId, dateKey, todayKey: today, nowHm } = input;
  const rows: TodayRow[] = [];

  for (const task of tasks) {
    if (!isTaskDueOn(task, dateKey)) continue;
    // An empty assignee list means the task is everyone's.
    if (task.assigneeIds.length > 0 && !task.assigneeIds.includes(memberId)) {
      continue;
    }

    const known = entries.filter(
      (entry) => entry.taskId === task.id && entry.memberId === memberId,
    );
    if (
      task.repeat.type === "once" &&
      known.some(
        (entry) => entry.status === "approved" || entry.status === "pending",
      )
    ) {
      // Done or awaiting a decision: a one-off never comes back. A rejected
      // one-off falls through — a redo is still owed.
      continue;
    }

    const entry = known.find((candidate) => candidate.dateKey === dateKey) ?? null;
    const state: TodayRow["state"] = entry
      ? entry.status
      : isOverdue(task, dateKey, today, nowHm)
        ? "late"
        : "todo";

    rows.push({ task, entry, state });
  }

  return rows.sort(
    (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.task.order - b.task.order,
  );
}

/**
 * The ring at the top of the screen. Only an approved entry counts as done
 * and only approved entries pay — pending coins are a promise, not earnings.
 */
export function progressOf(rows: TodayRow[]): {
  done: number;
  total: number;
  coins: number;
} {
  let done = 0;
  let coins = 0;
  for (const row of rows) {
    if (row.state !== "approved") continue;
    done += 1;
    coins += row.entry?.coin ?? 0;
  }
  return { done, total: rows.length, coins };
}
