import { describe, it, expect } from "vitest";
import type { RepeatRule, Task } from "../types";
import { isOverdue, isTaskDueOn } from "./due";

function task(repeat: RepeatRule, dueTime?: string, dueDate?: string): Task {
  return {
    id: "t1",
    householdId: "h1",
    title: "おふろそうじ",
    emoji: "🛁",
    coin: 3,
    needsApproval: false,
    assigneeIds: [],
    repeat,
    dueTime,
    dueDate,
    order: 0,
    archived: false,
    createdBy: "u1",
  };
}

describe("isTaskDueOn", () => {
  it("shows a once task on any date, because only entries retire it", () => {
    const once = task({ type: "once" });
    expect(isTaskDueOn(once, "2026-08-23")).toBe(true);
    expect(isTaskDueOn(once, "2027-01-01")).toBe(true);
  });

  it("shows a daily task every day", () => {
    const daily = task({ type: "daily" });
    expect(isTaskDueOn(daily, "2026-08-22")).toBe(true);
    expect(isTaskDueOn(daily, "2026-08-23")).toBe(true);
  });

  it("matches weekly tasks against the weekday", () => {
    // Mondays and Thursdays.
    const weekly = task({ type: "weekly", weekdays: [1, 4] });
    expect(isTaskDueOn(weekly, "2026-08-17")).toBe(true); // Monday
    expect(isTaskDueOn(weekly, "2026-08-20")).toBe(true); // Thursday
    expect(isTaskDueOn(weekly, "2026-08-18")).toBe(false); // Tuesday
    expect(isTaskDueOn(weekly, "2026-08-23")).toBe(false); // Sunday
  });

  it("matches a Sunday-only weekly task, so 0 is not treated as unset", () => {
    const sunday = task({ type: "weekly", weekdays: [0] });
    expect(isTaskDueOn(sunday, "2026-08-23")).toBe(true);
    expect(isTaskDueOn(sunday, "2026-08-24")).toBe(false);
  });

  it("matches monthly tasks against the day of month", () => {
    const monthly = task({ type: "monthly", days: [1, 15] });
    expect(isTaskDueOn(monthly, "2026-08-01")).toBe(true);
    expect(isTaskDueOn(monthly, "2026-08-15")).toBe(true);
    expect(isTaskDueOn(monthly, "2026-08-31")).toBe(false);
    expect(isTaskDueOn(monthly, "2026-09-15")).toBe(true);
  });

  it("never matches an empty schedule", () => {
    expect(isTaskDueOn(task({ type: "weekly", weekdays: [] }), "2026-08-23")).toBe(false);
    expect(isTaskDueOn(task({ type: "monthly", days: [] }), "2026-08-23")).toBe(false);
  });

  it("shows a weeklyCount/monthlyCount task every day, quota is enforced elsewhere", () => {
    const weeklyCount = task({ type: "weeklyCount", count: 2 });
    const monthlyCount = task({ type: "monthlyCount", count: 1 });
    expect(isTaskDueOn(weeklyCount, "2026-08-17")).toBe(true);
    expect(isTaskDueOn(weeklyCount, "2026-08-23")).toBe(true);
    expect(isTaskDueOn(monthlyCount, "2026-08-01")).toBe(true);
    expect(isTaskDueOn(monthlyCount, "2026-08-31")).toBe(true);
  });
});

describe("isOverdue", () => {
  const daily = task({ type: "daily" });
  const withDue = task({ type: "daily" }, "19:00");

  it("marks any past day as late", () => {
    expect(isOverdue(daily, "2026-08-22", "2026-08-23", "07:00")).toBe(true);
    expect(isOverdue(withDue, "2026-08-22", "2026-08-23", "07:00")).toBe(true);
  });

  it("never marks a future day as late", () => {
    expect(isOverdue(daily, "2026-08-24", "2026-08-23", "23:59")).toBe(false);
    expect(isOverdue(withDue, "2026-08-24", "2026-08-23", "23:59")).toBe(false);
  });

  it("leaves today alone when the task has no due time", () => {
    expect(isOverdue(daily, "2026-08-23", "2026-08-23", "23:59")).toBe(false);
  });

  it("marks today late only after the due time has passed", () => {
    expect(isOverdue(withDue, "2026-08-23", "2026-08-23", "18:59")).toBe(false);
    expect(isOverdue(withDue, "2026-08-23", "2026-08-23", "19:01")).toBe(true);
  });

  it("is not late at exactly the due time", () => {
    expect(isOverdue(withDue, "2026-08-23", "2026-08-23", "19:00")).toBe(false);
  });

  it("compares zero-padded times, not numbers", () => {
    const morning = task({ type: "daily" }, "09:00");
    expect(isOverdue(morning, "2026-08-23", "2026-08-23", "08:30")).toBe(false);
    expect(isOverdue(morning, "2026-08-23", "2026-08-23", "10:00")).toBe(true);
  });
});

describe("isOverdue with dueDate", () => {
  const once = task({ type: "once" }, undefined, "2026-08-25");
  const onceWithClock = task({ type: "once" }, "19:00", "2026-08-25");

  it("is not late before the deadline date, even past any due time that day", () => {
    expect(isOverdue(once, "2026-08-23", "2026-08-23", "23:59")).toBe(false);
  });

  it("is late every day after the deadline date has passed", () => {
    expect(isOverdue(once, "2026-08-26", "2026-08-26", "00:00")).toBe(true);
    expect(isOverdue(once, "2026-09-01", "2026-09-01", "00:00")).toBe(true);
  });

  it("on the deadline day itself, falls through to the due-time cutoff", () => {
    expect(isOverdue(onceWithClock, "2026-08-25", "2026-08-25", "18:59")).toBe(false);
    expect(isOverdue(onceWithClock, "2026-08-25", "2026-08-25", "19:01")).toBe(true);
  });

  it("on the deadline day with no due time, is not late until the next day", () => {
    expect(isOverdue(once, "2026-08-25", "2026-08-25", "23:59")).toBe(false);
  });
});
