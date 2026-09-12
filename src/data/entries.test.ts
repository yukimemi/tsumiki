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

const TASK_ID = "t1";
const MEMBER_ID = "kid";
const DATE_KEY = "2026-08-23";

// `seq` defaults to the slot the entry would occupy as the day's first
// completion; callers building a multi-slot day pass it explicitly so the id
// matches the real slot instead of just the array position.
function todayEntry(
  status: "pending" | "approved" | "rejected",
  seq = 1,
): Entry {
  return {
    id: entryId(TASK_ID, MEMBER_ID, DATE_KEY, seq),
    householdId: "h1",
    taskId: TASK_ID,
    taskTitle: "うんどう",
    taskEmoji: "🏃",
    memberId: MEMBER_ID,
    dateKey: DATE_KEY,
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
      targetEntrySlot([todayEntry("rejected", 1)], 1),
    ).toEqual({ seq: 1, redo: true });
    expect(
      targetEntrySlot(
        [todayEntry("approved", 1), todayEntry("rejected", 2)],
        2,
      ),
    ).toEqual({ seq: 2, redo: true });
  });

  it("opens the next slot while under a multi-completion daily limit", () => {
    expect(
      targetEntrySlot([todayEntry("approved", 1)], 3),
    ).toEqual({ seq: 2, redo: false });
  });

  it("refuses another slot once the daily limit is reached", () => {
    expect(
      targetEntrySlot(
        [todayEntry("approved", 1), todayEntry("pending", 2)],
        2,
      ),
    ).toBeNull();
  });

  it("redoes a rejected entry that isn't the trailing one", () => {
    // Oldest slot got rejected while a newer one is still pending — the
    // approval queue is oldest-first, but a parent can decide any pending
    // entry first, so rejection order need not match completion order.
    expect(
      targetEntrySlot(
        [todayEntry("rejected", 1), todayEntry("pending", 2)],
        3,
      ),
    ).toEqual({ seq: 1, redo: true });
  });

  it("redoes the rejected slot by its own id even once a redo has reordered the array", () => {
    // seq 2 was rejected, but a since-redone seq 1 now has a later
    // `completedAt` and sorts after it — array position (0) must not be
    // mistaken for seq: only the id says this rejected entry is seq 2.
    expect(
      targetEntrySlot(
        [todayEntry("rejected", 2), todayEntry("pending", 1)],
        3,
      ),
    ).toEqual({ seq: 2, redo: true });
  });

  it("opens a fresh seq past the highest surviving one, not past the array length", () => {
    // Slots 1-3 were completed; slot 2 was then undone (its entry deleted
    // outright, not left behind as `rejected`), so only slots 1 and 3
    // remain — an array of length 2. `todayEntries.length + 1` would say
    // "3" and collide with — and overwrite — the surviving slot-3 entry.
    expect(
      targetEntrySlot(
        [todayEntry("approved", 1), todayEntry("approved", 3)],
        5,
      ),
    ).toEqual({ seq: 4, redo: false });
  });
});
