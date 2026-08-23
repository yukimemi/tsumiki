import { describe, expect, it } from "vitest";

import type { Entry, EntryStatus, RepeatRule, Task } from "../types";
import { progressOf, todayRowsFor } from "./today";

function task(overrides: Partial<Task> & { repeat?: RepeatRule } = {}): Task {
  return {
    id: "t1",
    householdId: "h1",
    title: "おふろそうじ",
    emoji: "🛁",
    coin: 3,
    needsApproval: false,
    assigneeIds: [],
    repeat: { type: "daily" },
    order: 0,
    archived: false,
    createdBy: "u1",
    ...overrides,
  };
}

function entry(
  taskId: string,
  memberId: string,
  dateKey: string,
  status: EntryStatus,
  coin = 3,
): Entry {
  return {
    id: `${taskId}__${memberId}__${dateKey}`,
    householdId: "h1",
    taskId,
    taskTitle: "おふろそうじ",
    taskEmoji: "🛁",
    memberId,
    dateKey,
    status,
    coin,
    // The selectors never read the timestamp; the shape is all they need.
    completedAt: {} as Entry["completedAt"],
    commentCount: 0,
  };
}

const TODAY = "2026-08-23";

function rowsFor(input: {
  tasks: Task[];
  entries?: Entry[];
  memberId?: string;
  dateKey?: string;
  nowHm?: string;
}) {
  return todayRowsFor({
    tasks: input.tasks,
    entries: input.entries ?? [],
    memberId: input.memberId ?? "kid",
    dateKey: input.dateKey ?? TODAY,
    todayKey: TODAY,
    nowHm: input.nowHm ?? "10:00",
  });
}

describe("todayRowsFor", () => {
  it("shows a daily task with no entry as todo", () => {
    const rows = rowsFor({ tasks: [task()] });
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("todo");
    expect(rows[0].entry).toBeNull();
  });

  it("marks a task late once its dueTime has passed today", () => {
    const withDue = task({ dueTime: "09:00" });
    expect(rowsFor({ tasks: [withDue], nowHm: "09:01" })[0].state).toBe("late");
    expect(rowsFor({ tasks: [withDue], nowHm: "09:00" })[0].state).toBe("todo");
  });

  it("leaves out a task that is not due on the shown day", () => {
    // 2026-08-23 is a Sunday; this task is Mondays only.
    const mondays = task({ repeat: { type: "weekly", weekdays: [1] } });
    expect(rowsFor({ tasks: [mondays] })).toHaveLength(0);
  });

  it("leaves out a task assigned to somebody else", () => {
    const sisters = task({ assigneeIds: ["sister"] });
    expect(rowsFor({ tasks: [sisters], memberId: "kid" })).toHaveLength(0);
  });

  it("treats an empty assignee list as everyone", () => {
    const everyones = task({ assigneeIds: [] });
    expect(rowsFor({ tasks: [everyones], memberId: "kid" })).toHaveLength(1);
    expect(rowsFor({ tasks: [everyones], memberId: "mum" })).toHaveLength(1);
  });

  it("never brings back a completed once task, even on a later day", () => {
    const once = task({ repeat: { type: "once" } });
    const done = entry("t1", "kid", "2026-08-20", "approved");
    expect(
      rowsFor({ tasks: [once], entries: [done], dateKey: "2026-08-25" }),
    ).toHaveLength(0);
    // Waiting on a parent retires it just the same.
    const waiting = entry("t1", "kid", "2026-08-20", "pending");
    expect(
      rowsFor({ tasks: [once], entries: [waiting], dateKey: "2026-08-25" }),
    ).toHaveLength(0);
  });

  it("keeps a once task on the day it was done so it can be taken back", () => {
    // The bug this guards: a one-off retired from its own day the instant it
    // went `pending`, which removed the row and with it the only undo. Two
    // real entries sat in the queue that nobody could cancel.
    const once = task({ repeat: { type: "once" }, needsApproval: true });
    const waiting = entry("t1", "kid", "2026-08-23", "pending");
    const rows = rowsFor({
      tasks: [once],
      entries: [waiting],
      dateKey: "2026-08-23",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("pending");
    expect(rows[0].entry).toBe(waiting);

    // Approved on its own day stays visible too — undo is still owed.
    const done = entry("t1", "kid", "2026-08-23", "approved");
    const sameDay = rowsFor({
      tasks: [once],
      entries: [done],
      dateKey: "2026-08-23",
    });
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0].state).toBe("approved");
  });

  it("keeps a rejected entry actionable so the task can be redone", () => {
    const bounced = entry("t1", "kid", TODAY, "rejected");
    const rows = rowsFor({ tasks: [task()], entries: [bounced] });
    expect(rows[0].state).toBe("rejected");
    // Actionable means sorted into the first group, ahead of anything pending.
    const waiting = task({ id: "t2", order: 0 });
    const waitingRows = rowsFor({
      tasks: [waiting, task()],
      entries: [bounced, entry("t2", "kid", TODAY, "pending")],
    });
    expect(waitingRows.map((row) => row.state)).toEqual(["rejected", "pending"]);
  });

  it("sorts late above todo above pending above approved", () => {
    const lateTask = task({ id: "t-late", dueTime: "08:00", order: 3 });
    const todoTask = task({ id: "t-todo", order: 2 });
    const pendingTask = task({ id: "t-pending", order: 1 });
    const approvedTask = task({ id: "t-approved", order: 0 });
    const rows = rowsFor({
      tasks: [approvedTask, pendingTask, todoTask, lateTask],
      entries: [
        entry("t-pending", "kid", TODAY, "pending"),
        entry("t-approved", "kid", TODAY, "approved"),
      ],
      nowHm: "12:00",
    });
    expect(rows.map((row) => row.state)).toEqual([
      "late",
      "todo",
      "pending",
      "approved",
    ]);
  });
});

describe("progressOf", () => {
  it("counts only approved rows and sums only their coins", () => {
    const rows = rowsFor({
      tasks: [
        task({ id: "t-approved", coin: 3 }),
        task({ id: "t-pending", coin: 5 }),
        task({ id: "t-todo", coin: 7 }),
      ],
      entries: [
        entry("t-approved", "kid", TODAY, "approved", 3),
        entry("t-pending", "kid", TODAY, "pending", 5),
      ],
    });
    expect(progressOf(rows)).toEqual({ done: 1, total: 3, coins: 3 });
  });
});
