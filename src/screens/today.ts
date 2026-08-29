// What the Today screen shows, as pure functions over the snapshots the
// screen already holds. No React, no Firestore: the hooks hand in tasks and
// entries, and these decide which rows exist, what state each is in, and in
// what order. Kept pure so the rules a child lives by — what is due, what is
// late, what a rejection means — are testable without a screen.

import { monthKeyOf, weekKeyOf } from "../lib/date";
import { isOverdue, isTaskDueOn } from "../lib/due";
import type { Entry, Task } from "../types";

export type TodayRow = {
  task: Task;
  /** The entry for this (task, member, shown day), when one exists. */
  entry: Entry | null;
  state: "todo" | "pending" | "approved" | "rejected" | "late";
  /**
   * Only set for `weeklyCount` / `monthlyCount` tasks: how many of the
   * period's quota are already claimed (approved or pending), this row's
   * own entry included.
   */
  periodProgress?: { done: number; count: number };
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
    const entry = known.find((candidate) => candidate.dateKey === dateKey) ?? null;

    // A one-off does not come back once it has been done — but only on days
    // other than the one it was done on. Retiring it from its own day too
    // took the row away the instant it went `pending`, and with the row went
    // the only way to take the completion back: the queue then had an entry
    // nobody could cancel and only a parent could clear.
    if (
      task.repeat.type === "once" &&
      entry === null &&
      known.some(
        (candidate) =>
          candidate.status === "approved" || candidate.status === "pending",
      )
    ) {
      continue;
    }

    // A weeklyCount/monthlyCount task can be done on any day of its
    // period, but only up to `count` times — same "the day it happened on
    // stays visible, every other day doesn't come back" shape as `once`,
    // just scoped to the period instead of forever.
    let periodProgress: TodayRow["periodProgress"];
    if (task.repeat.type === "weeklyCount" || task.repeat.type === "monthlyCount") {
      const periodKeyOf = task.repeat.type === "weeklyCount" ? weekKeyOf : monthKeyOf;
      const periodKey = periodKeyOf(dateKey);
      const claimed = known.filter(
        (candidate) =>
          (candidate.status === "approved" || candidate.status === "pending") &&
          periodKeyOf(candidate.dateKey) === periodKey,
      ).length;
      if (entry === null && claimed >= task.repeat.count) continue;
      periodProgress = { done: claimed, count: task.repeat.count };
    }

    // These two have no per-day deadline — any day of the period is fine —
    // so `isOverdue` must not run for them: a past day within a still-open
    // period is not "late", it is just an earlier chance already taken or
    // skipped. `periodProgress` is what tells the parent "at risk", not a
    // late badge on every day the child didn't happen to pick.
    const state: TodayRow["state"] = entry
      ? entry.status
      : task.repeat.type === "weeklyCount" || task.repeat.type === "monthlyCount"
        ? "todo"
        : isOverdue(task, dateKey, today, nowHm)
          ? "late"
          : "todo";

    rows.push({ task, entry, state, periodProgress });
  }

  return rows.sort(
    (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.task.order - b.task.order,
  );
}

/** Where rows with no `category` collect. Always last. */
export const UNFILED_LABEL = "そのほか";

/**
 * Bucket key for rows with no category.
 *
 * Not `UNFILED_LABEL`: keying on the display name means a chore actually
 * filed under 「そのほか」 lands in the same bucket as the unfiled ones and
 * can never be told apart again — its rows, its counts and its late flag all
 * merge into theirs. A NUL cannot survive `trim()` on a typed name, so this
 * key cannot collide with one. The editor also refuses the name outright, so
 * two groups never *show* the same header; this is the half that keeps the
 * arithmetic right whatever is already in the data.
 */
const UNFILED_KEY = "\u0000unfiled";

export type TodayGroup = {
  /**
   * Stable identity, distinct from `label`.
   *
   * The unfiled group and a group actually filed under 「そのほか」 render
   * the same header, so the label cannot serve as a React key or as the
   * handle for per-group UI state — they would collide exactly where the
   * bucket key stops them colliding.
   */
  key: string;
  /** The category name, or `UNFILED_LABEL`. */
  label: string;
  rows: TodayRow[];
  done: number;
  total: number;
  /** True when something in here is past its time — see `groupTodayRows`. */
  hasLate: boolean;
};

/**
 * The same rows, in labelled groups.
 *
 * Group order is the smallest `task.order` in the group, which means the
 * ▲▼ reordering a parent already has in やること管理 decides it: put the
 * chores of a group next to each other and the group moves with them. A
 * second ordering concept — per-category positions, another editor, another
 * field to keep in step — buys nothing that is not already expressible.
 *
 * `そのほか` is pinned last however its tasks are ordered, because "not
 * filed yet" is not a rank.
 *
 * Row order *inside* a group is left exactly as `todayRowsFor` sorted it, so
 * late and redo rows still surface first where a child is looking. What
 * grouping does cost is the global view of that: a late chore in the third
 * group is no longer the first thing on screen. `hasLate` exists so the
 * header can say so without the child having to open the group to find out.
 */
type CategoryBucket<T> = {
  key: string;
  label: string;
  items: T[];
};

/**
 * The shared shape behind every "group these by category" view: bucket by
 * the trimmed category (blank collapses to the unfiled bucket, keyed apart
 * from a group actually named `UNFILED_LABEL`), then order buckets by the
 * smallest `order` inside them so ▲▼ reordering already decides group order
 * too, with the unfiled bucket pinned last whatever its tasks' order is.
 *
 * `groupTodayRows` and `groupTasksByCategory` both reduce to this shape —
 * one over `TodayRow`, the other over `Task` directly — and only differ in
 * what they aggregate per bucket afterward (done/hasLate counts vs. none).
 */
function bucketByCategory<T>(
  items: T[],
  categoryOf: (item: T) => string | undefined,
  orderOf: (item: T) => number,
): CategoryBucket<T>[] {
  const buckets = new Map<string, CategoryBucket<T>>();
  const ranks = new Map<string, number>();

  for (const item of items) {
    const filed = categoryOf(item)?.trim();
    const key = filed || UNFILED_KEY;
    const bucket = buckets.get(key) ?? {
      key,
      label: filed || UNFILED_LABEL,
      items: [],
    };
    bucket.items.push(item);
    buckets.set(key, bucket);

    // Unfiled sorts after every real group whatever its items' order.
    const rank = filed ? orderOf(item) : Number.POSITIVE_INFINITY;
    ranks.set(key, Math.min(ranks.get(key) ?? Number.POSITIVE_INFINITY, rank));
  }

  // Compared rather than subtracted: the unfiled bucket's rank is Infinity,
  // and Infinity - Infinity is NaN, which would make the sort order
  // undefined the day a second sentinel bucket exists.
  return [...buckets.entries()]
    .sort(([ka, a], [kb, b]) => {
      const ra = ranks.get(ka) ?? 0;
      const rb = ranks.get(kb) ?? 0;
      if (ra !== rb) return ra < rb ? -1 : 1;
      return a.label.localeCompare(b.label, "ja");
    })
    .map(([, bucket]) => bucket);
}

export function groupTodayRows(rows: TodayRow[]): TodayGroup[] {
  return bucketByCategory(
    rows,
    (row) => row.task.category,
    (row) => row.task.order,
  ).map((bucket) => {
    const done = bucket.items.filter((row) => row.state === "approved").length;
    const hasLate = bucket.items.some((row) => row.state === "late");
    return {
      key: bucket.key,
      label: bucket.label,
      rows: bucket.items,
      done,
      total: bucket.items.length,
      hasLate,
    };
  });
}

export type TaskCategoryGroup = {
  /** Stable identity, distinct from `label` — see `TodayGroup.key`. */
  key: string;
  /** The category name, or `UNFILED_LABEL`. */
  label: string;
  tasks: Task[];
};

/**
 * Tasks bucketed by `category`, ordered the same way `groupTodayRows`
 * orders its groups (smallest `task.order` first, `そのほか` pinned last).
 *
 * For やること管理: a parent could already see this shape by opening every
 * task's editor one at a time to read its category back. Grouping the list
 * itself is that same information, laid out instead of hidden behind a tap.
 */
export function groupTasksByCategory(tasks: Task[]): TaskCategoryGroup[] {
  return bucketByCategory(
    tasks,
    (task) => task.category,
    (task) => task.order,
  ).map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    tasks: bucket.items,
  }));
}

/**
 * Every category already in use, for offering them instead of retyping.
 *
 * `そのほか` is filtered out even if a task somehow carries it: suggesting
 * the name the unfiled group already displays would invite two sections with
 * one header.
 */
export function categoriesOf(tasks: Task[]): string[] {
  const seen = new Set<string>();
  for (const task of tasks) {
    const label = task.category?.trim();
    if (label && label !== UNFILED_LABEL) seen.add(label);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "ja"));
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
