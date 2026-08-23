import { describe, it, expect } from "vitest";
import type { RepeatRule, Task } from "../types";
import { isOverdue, isTaskDueOn } from "./due";

function task(repeat: RepeatRule, dueTime?: string): Task {
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
