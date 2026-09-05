// Pure rules only — no Firebase in the module graph, so these run without an
// emulator or a mock. The Firestore calls in `entries.ts` are plumbing around
// these two decisions plus one deterministic id.

import { describe, expect, it } from "vitest";
import { targetEntrySlot } from "./entries";
import { entryId } from "../lib/ids";
import type { Entry } from "../types";
import { coinDeltaForUndo, statusForTask } from "./entryRules";

describe("statusForTask", () => {
  it("holds a task that needs a parent", () => {
    expect(statusForTask({ needsApproval: true })).toBe("pending");
  });

  it("pays a task that does not", () => {
    expect(statusForTask({ needsApproval: false })).toBe("approved");
  });
});

describe("coinDeltaForUndo", () => {
  it("gives back exactly what an approved entry paid", () => {
    expect(coinDeltaForUndo({ status: "approved", coin: 3 })).toBe(-3);
  });

  it("moves nothing for a pending entry: it never paid", () => {
    expect(coinDeltaForUndo({ status: "pending", coin: 3 })).toBe(0);
  });

  it("moves nothing for a rejected entry", () => {
    expect(coinDeltaForUndo({ status: "rejected", coin: 3 })).toBe(0);
  });
});

describe("entryId", () => {
  it("is stable for the same task, member and day", () => {
    expect(entryId("task1", "member1", "2026-08-23")).toBe(
      entryId("task1", "member1", "2026-08-23"),
    );
  });

  it("differs when any part of the triple differs", () => {
    const base = entryId("task1", "member1", "2026-08-23");
    expect(entryId("task2", "member1", "2026-08-23")).not.toBe(base);
    expect(entryId("task1", "member2", "2026-08-23")).not.toBe(base);
    expect(entryId("task1", "member1", "2026-08-24")).not.toBe(base);
  });

  it("appends a seq for any completion beyond the first", () => {
    const first = entryId("task1", "member1", "2026-08-23", 1);
    expect(first).toBe(entryId("task1", "member1", "2026-08-23"));
    const second = entryId("task1", "member1", "2026-08-23", 2);
    expect(second).not.toBe(first);
    expect(second).toBe(`${first}__2`);
  });
});

function todayEntry(status: "pending" | "approved" | "rejected"): Entry {
  return {
    id: "e1",
    householdId: "h1",
    taskId: "t1",
    taskTitle: "うんどう",
    taskEmoji: "🏃",
    memberId: "kid",
    dateKey: "2026-08-23",
    status,
    coin: 1,
    completedAt: {} as Entry["completedAt"],
    commentCount: 0,
  };
}

describe("targetEntrySlot", () => {
  it("opens slot 1 for a fresh day", () => {
    expect(targetEntrySlot([], 1)).toEqual({ seq: 1, redo: false });
  });

  it("redoes the trailing rejected entry in place regardless of the limit", () => {
    expect(
      targetEntrySlot([todayEntry("rejected")], 1),
    ).toEqual({ seq: 1, redo: true });
    expect(
      targetEntrySlot(
        [todayEntry("approved"), todayEntry("rejected")],
        2,
      ),
    ).toEqual({ seq: 2, redo: true });
  });

  it("opens the next slot while under a multi-completion daily limit", () => {
    expect(
      targetEntrySlot([todayEntry("approved")], 3),
    ).toEqual({ seq: 2, redo: false });
  });

  it("refuses another slot once the daily limit is reached", () => {
    expect(
      targetEntrySlot(
        [todayEntry("approved"), todayEntry("pending")],
        2,
      ),
    ).toBeNull();
  });
});
