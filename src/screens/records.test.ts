import { describe, expect, it } from "vitest";

import type { Entry, EntryStatus } from "../types";
import { monthGrid, weekKeys } from "../lib/date";
import {
  approvedDateKeys,
  coinsInRange,
  dayCellsFor,
  totalsByMember,
  weeklySeries,
} from "./records";

const MONTH = "2026-08";

let seq = 0;

/**
 * `completedAt` is never read by the aggregation, so a cast stub stands in
 * for a real Timestamp.
 */
function entry(input: {
  memberId: string;
  dateKey: string;
  coin: number;
  status?: EntryStatus;
}): Entry {
  seq += 1;
  return {
    id: `task-${seq}__${input.memberId}__${input.dateKey}`,
    householdId: "h1",
    taskId: `task-${seq}`,
    taskTitle: "テストタスク",
    taskEmoji: "🧱",
    memberId: input.memberId,
    dateKey: input.dateKey,
    status: input.status ?? "approved",
    coin: input.coin,
    completedAt: null as unknown as Entry["completedAt"],
    commentCount: 0,
  };
}

describe("dayCellsFor", () => {
  it("returns 6 rows of 7 cells and marks padding days as outside the month", () => {
    const cells = dayCellsFor({ monthKey: MONTH, entries: [], memberId: null });
    expect(cells).toHaveLength(6);
    for (const week of cells) expect(week).toHaveLength(7);

    const flat = cells.flat();
    expect(flat[0].inMonth).toBe(false); // July padding before Aug 1 (Saturday)
    expect(flat[flat.length - 1].inMonth).toBe(false); // September padding
    expect(flat.filter((cell) => cell.inMonth)).toHaveLength(31);

    // The cells mirror monthGrid exactly, padding included.
    const grid = monthGrid(MONTH);
    expect(flat.map((cell) => cell.dateKey)).toEqual(grid.flat());
  });

  it("counts approved entries and sums their coins per day", () => {
    const entries = [
      entry({ memberId: "a", dateKey: "2026-08-10", coin: 3 }),
      entry({ memberId: "a", dateKey: "2026-08-10", coin: 5 }),
      entry({ memberId: "b", dateKey: "2026-08-10", coin: 2 }),
    ];
    const cells = dayCellsFor({ monthKey: MONTH, entries, memberId: null });
    const day = cells.flat().find((cell) => cell.dateKey === "2026-08-10");
    expect(day).toEqual({
      dateKey: "2026-08-10",
      count: 3,
      coins: 10,
      inMonth: true,
    });
  });

  it("excludes pending and rejected entries", () => {
    const entries = [
      entry({ memberId: "a", dateKey: "2026-08-10", coin: 3, status: "pending" }),
      entry({ memberId: "a", dateKey: "2026-08-10", coin: 5, status: "rejected" }),
    ];
    const cells = dayCellsFor({ monthKey: MONTH, entries, memberId: null });
    const day = cells.flat().find((cell) => cell.dateKey === "2026-08-10");
    expect(day?.count).toBe(0);
    expect(day?.coins).toBe(0);
  });

  it("filters by member, or counts the whole family when memberId is null", () => {
    const entries = [
      entry({ memberId: "a", dateKey: "2026-08-10", coin: 3 }),
      entry({ memberId: "b", dateKey: "2026-08-10", coin: 2 }),
    ];
    const onlyA = dayCellsFor({ monthKey: MONTH, entries, memberId: "a" });
    const dayA = onlyA.flat().find((cell) => cell.dateKey === "2026-08-10");
    expect(dayA?.count).toBe(1);
    expect(dayA?.coins).toBe(3);

    const everyone = dayCellsFor({ monthKey: MONTH, entries, memberId: null });
    const dayAll = everyone.flat().find((cell) => cell.dateKey === "2026-08-10");
    expect(dayAll?.count).toBe(2);
    expect(dayAll?.coins).toBe(5);
  });
});

describe("totalsByMember", () => {
  it("sums per member, sorts by coins descending, and skips undecided entries", () => {
    const entries = [
      entry({ memberId: "a", dateKey: "2026-08-01", coin: 3 }),
      entry({ memberId: "b", dateKey: "2026-08-01", coin: 10 }),
      entry({ memberId: "a", dateKey: "2026-08-02", coin: 4 }),
      entry({ memberId: "b", dateKey: "2026-08-02", coin: 99, status: "pending" }),
      entry({ memberId: "c", dateKey: "2026-08-02", coin: 7, status: "rejected" }),
    ];
    expect(totalsByMember(entries)).toEqual([
      { memberId: "b", done: 1, coins: 10 },
      { memberId: "a", done: 2, coins: 7 },
    ]);
  });
});

describe("coinsInRange", () => {
  it("sums approved coins only, per member or for the whole family", () => {
    const entries = [
      entry({ memberId: "a", dateKey: "2026-08-01", coin: 3 }),
      entry({ memberId: "b", dateKey: "2026-08-01", coin: 10 }),
      entry({ memberId: "a", dateKey: "2026-08-02", coin: 9, status: "pending" }),
      entry({ memberId: "b", dateKey: "2026-08-03", coin: 8, status: "rejected" }),
    ];
    expect(coinsInRange(entries, null)).toBe(13);
    expect(coinsInRange(entries, "a")).toBe(3);
    expect(coinsInRange(entries, "b")).toBe(10);
  });
});

describe("approvedDateKeys", () => {
  it("de-duplicates a day with two completions and returns ascending keys", () => {
    const entries = [
      entry({ memberId: "a", dateKey: "2026-08-10", coin: 3 }),
      entry({ memberId: "a", dateKey: "2026-08-05", coin: 1 }),
      entry({ memberId: "a", dateKey: "2026-08-10", coin: 5 }),
      entry({ memberId: "a", dateKey: "2026-08-11", coin: 2, status: "pending" }),
      entry({ memberId: "b", dateKey: "2026-08-07", coin: 2 }),
    ];
    expect(approvedDateKeys(entries, "a")).toEqual(["2026-08-05", "2026-08-10"]);
  });
});

describe("weeklySeries", () => {
  it("returns one point per week key, in order, with zeroes for empty days", () => {
    const keys = weekKeys("2026-08-23"); // Mon 2026-08-17 .. Sun 2026-08-23
    const entries = [
      entry({ memberId: "a", dateKey: keys[0], coin: 3 }),
      entry({ memberId: "a", dateKey: keys[0], coin: 1 }),
      entry({ memberId: "a", dateKey: keys[6], coin: 2, status: "pending" }),
    ];
    const series = weeklySeries({ weekKeys: keys, entries, memberId: null });
    expect(series.map((point) => point.dateKey)).toEqual(keys);
    expect(series[0]).toEqual({ dateKey: keys[0], count: 2, coins: 4 });
    expect(series[1]).toEqual({ dateKey: keys[1], count: 0, coins: 0 });
    expect(series[6]).toEqual({ dateKey: keys[6], count: 0, coins: 0 });
  });
});
