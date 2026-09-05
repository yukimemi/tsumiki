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
  /**
   * Every entry this member has for this task on the shown day, oldest
   * first. Usually zero or one — `dailyLimit` is what lets it grow past
   * one, each element its own completion with its own coin, photo and
   * comment thread.
   */
  entries: Entry[];
  /** The most recent of `entries`, when one exists — everything that only
   * ever needed "the" entry (undo, photo, comments, reject reason) keeps
   * acting on this one. */
  entry: Entry | null;
  state: "todo" | "pending" | "approved" | "rejected" | "late";
  /**
   * Only set for `weeklyCount` / `monthlyCount` tasks: how many of the
   * period's quota are already claimed (approved or pending), this row's
   * own entry included.
   */
  periodProgress?: { done: number; count: number };
  /**
   * Only set when `Task.dailyLimit` is above the default of one: how many
   * of today's allowance are already claimed (approved or pending). The row
   * stays tappable (`state` "todo"/"late") until `done` reaches `count`.
   */
  dailyProgress?: { done: number; count: number };
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
 * `completedAt` is a resolved Firestore `Timestamp` once a live snapshot has
 * it, but a hand-built test fixture may carry a bare placeholder instead —
 * that's fine, everything sorts to 0 and a stable sort keeps fixture order.
 */
function completedAtMillis(entry: Entry): number {
  const value = entry.completedAt as { toMillis?: () => number } | undefined;
  return typeof value?.toMillis === "function" ? value.toMillis() : 0;
}

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
      (candidate) => candidate.taskId === task.id && candidate.memberId === memberId,
    );
    // Oldest first, so `.at(-1)` is always "the most recent completion" and
    // `todays.length` is a stable count to derive a new slot's position
    // from. `completedAt` is a resolved `Timestamp` once a snapshot is live;
    // sort is a no-op (and harmless) before that.
    const todays = known
      .filter((candidate) => candidate.dateKey === dateKey)
      .sort((a, b) => completedAtMillis(a) - completedAtMillis(b));
    const entry = todays.at(-1) ?? null;

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
    // just scoped to the period instead of forever. `dailyLimit` is a
    // different axis (repeats within one day) and does not apply to these.
    const isPeriodType =
      task.repeat.type === "weeklyCount" || task.repeat.type === "monthlyCount";
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

    // How many of today's own allowance (default 1) are already claimed.
    // Below the limit the row stays open for another tap even though a
    // previous completion today already landed — that is the whole point
    // of `dailyLimit`, and it is what tells `state` below to keep offering
    // "todo" instead of freezing on the last completion's status.
    const dailyLimit = task.dailyLimit ?? 1;
    const claimedToday = todays.filter(
      (candidate) => candidate.status === "approved" || candidate.status === "pending",
    ).length;
    const canAddMore = !isPeriodType && claimedToday < dailyLimit;
    const dailyProgress: TodayRow["dailyProgress"] =
      !isPeriodType && dailyLimit > 1
        ? { done: claimedToday, count: dailyLimit }
        : undefined;

    // These two have no per-day deadline — any day of the period is fine —
    // so `isOverdue` must not run for them: a past day within a still-open
    // period is not "late", it is just an earlier chance already taken or
    // skipped. `periodProgress` is what tells the parent "at risk", not a
    // late badge on every day the child didn't happen to pick.
    const openState: TodayRow["state"] = isPeriodType
      ? "todo"
      : isOverdue(task, dateKey, today, nowHm)
        ? "late"
        : "todo";

    // A rejected completion always needs a redo before anything else, no
    // matter how much of today's allowance is otherwise spoken for; short of
    // that, a settled task (no room left today) freezes on its own status,
    // and one with room left stays open for the next tap.
    const state: TodayRow["state"] =
      entry && entry.status === "rejected"
        ? "rejected"
        : entry && !canAddMore
          ? entry.status
          : openState;

    rows.push({ task, entries: todays, entry, state, periodProgress, dailyProgress });
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
 * Whether the group at `index` can trade places with the one `delta` away.
 *
 * The unfiled bucket is pinned last by rank whatever its tasks' `order`, so a
 * move that touched it would rewrite `order` and change nothing on screen. A
 * group with no reachable neighbour therefore has no button at all rather
 * than one that lies.
 */
export function canMoveCategoryGroup(
  groups: TaskCategoryGroup[],
  index: number,
  delta: number,
): boolean {
  const from = groups[index];
  const to = groups[index + delta];
  if (!from || !to) return false;
  return from.key !== UNFILED_KEY && to.key !== UNFILED_KEY;
}

/**
 * Every task id in the order that swapping the group at `index` with the one
 * `delta` away produces — `reorderTasks` input, so ids outside `groups`
 * travel along in their own slots or they would collide with the rewritten
 * positions.
 *
 * Group order is not stored anywhere: it is read back from the smallest
 * `order` in each group, which is why ↑ / ↓ on a single task can never move
 * one (a swap inside a group leaves the group's own slots, and so its
 * minimum, exactly where they were). Moving a group means moving its tasks,
 * so the groups are re-laid as contiguous blocks in the new order and their
 * tasks poured back into the slots the list already occupied in `all`. Tasks
 * of the other list — active rows while the archived ones are being moved,
 * and the reverse — keep their slots, so their own grouping does not shift.
 *
 * `null` when the move is not available, so the caller can ask and act with
 * one answer.
 */
export function moveCategoryGroup(
  all: Task[],
  groups: TaskCategoryGroup[],
  index: number,
  delta: number,
): string[] | null {
  if (!canMoveCategoryGroup(groups, index, delta)) return null;

  const next = [...groups];
  next[index] = groups[index + delta];
  next[index + delta] = groups[index];

  const moved = next.flatMap((group) => group.tasks.map((task) => task.id));
  const inGroups = new Set(moved);
  let taken = 0;
  return all.map((task) =>
    inGroups.has(task.id) ? moved[taken++] : task.id,
  );
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
 * The ring at the top of the screen. `done` counts a row once it is fully
 * settled for the day (state `approved`) — the same "one unit per task" it
 * always was. Coins are summed across every one of the row's own entries
 * that landed `approved`, though: a multi-completion task that has banked
 * coins from earlier taps today must show them before the row itself
 * finishes, or a child watching the ring would see nothing move.
 */
export function progressOf(rows: TodayRow[]): {
  done: number;
  total: number;
  coins: number;
} {
  let done = 0;
  let coins = 0;
  for (const row of rows) {
    if (row.state === "approved") done += 1;
    for (const entry of row.entries) {
      if (entry.status === "approved") coins += entry.coin;
    }
  }
  return { done, total: rows.length, coins };
}
