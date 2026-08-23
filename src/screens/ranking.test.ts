import { describe, expect, it } from "vitest";

import type { Balance, Entry, EntryStatus } from "../types";
import { earnedTotals, periodTotals, rankByCoins } from "./ranking";

let seq = 0;

/** `completedAt` is never read here, so a cast stub stands in for a Timestamp. */
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

function balance(memberId: string, coins: number, earned: number): Balance {
  return {
    id: `h1__${memberId}`,
    householdId: "h1",
    memberId,
    coins,
    earned,
    updatedAt: null as unknown as Balance["updatedAt"],
  };
}

describe("rankByCoins", () => {
  it("sorts richest first and numbers from one", () => {
    const rows = rankByCoins([
      { memberId: "a", coins: 5 },
      { memberId: "b", coins: 12 },
      { memberId: "c", coins: 9 },
    ]);
    expect(rows.map((row) => [row.memberId, row.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });

  it("gives tied members the same rank and skips the ranks they used up", () => {
    const rows = rankByCoins([
      { memberId: "a", coins: 10 },
      { memberId: "b", coins: 10 },
      { memberId: "c", coins: 4 },
      { memberId: "d", coins: 4 },
      { memberId: "e", coins: 1 },
    ]);
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 3, 3, 5]);
  });

  it("keeps the input order between members who are level", () => {
    const rows = rankByCoins([
      { memberId: "first", coins: 7 },
      { memberId: "second", coins: 7 },
    ]);
    expect(rows.map((row) => row.memberId)).toEqual(["first", "second"]);
  });

  it("measures the gap to the rank above, not to the leader", () => {
    const rows = rankByCoins([
      { memberId: "a", coins: 20 },
      { memberId: "b", coins: 12 },
      { memberId: "c", coins: 12 },
      { memberId: "d", coins: 3 },
    ]);
    expect(rows.map((row) => row.gapToAbove)).toEqual([0, 8, 8, 9]);
  });

  it("scales the bar against the leader", () => {
    const rows = rankByCoins([
      { memberId: "a", coins: 20 },
      { memberId: "b", coins: 5 },
      { memberId: "c", coins: 0 },
    ]);
    expect(rows.map((row) => row.share)).toEqual([1, 0.25, 0]);
  });

  it("puts everyone on rank 1 with no bar before anyone has earned anything", () => {
    const rows = rankByCoins([
      { memberId: "a", coins: 0 },
      { memberId: "b", coins: 0 },
    ]);
    expect(rows.map((row) => row.rank)).toEqual([1, 1]);
    expect(rows.map((row) => row.share)).toEqual([0, 0]);
    expect(rows.map((row) => row.gapToAbove)).toEqual([0, 0]);
  });

  it("returns nothing for nobody", () => {
    expect(rankByCoins([])).toEqual([]);
  });
});

describe("periodTotals", () => {
  const memberIds = ["a", "b", "c"];

  it("sums approved coins and completions inside the range, per member", () => {
    const entries = [
      entry({ memberId: "a", dateKey: "2026-08-10", coin: 3 }),
      entry({ memberId: "a", dateKey: "2026-08-12", coin: 4 }),
      entry({ memberId: "b", dateKey: "2026-08-11", coin: 5 }),
    ];
    expect(
      periodTotals({ entries, memberIds, fromKey: "2026-08-10", toKey: "2026-08-16" }),
    ).toEqual([
      { memberId: "a", coins: 7, done: 2 },
      { memberId: "b", coins: 5, done: 1 },
      { memberId: "c", coins: 0, done: 0 },
    ]);
  });

  it("includes both bounds and excludes the days outside them", () => {
    const entries = [
      entry({ memberId: "a", dateKey: "2026-08-09", coin: 100 }),
      entry({ memberId: "a", dateKey: "2026-08-10", coin: 1 }),
      entry({ memberId: "a", dateKey: "2026-08-16", coin: 2 }),
      entry({ memberId: "a", dateKey: "2026-08-17", coin: 100 }),
    ];
    const [row] = periodTotals({
      entries,
      memberIds: ["a"],
      fromKey: "2026-08-10",
      toKey: "2026-08-16",
    });
    expect(row).toEqual({ memberId: "a", coins: 3, done: 2 });
  });

  it("covers a whole month whatever its length, since the keys sort as dates", () => {
    const entries = [
      entry({ memberId: "a", dateKey: "2026-02-01", coin: 1 }),
      entry({ memberId: "a", dateKey: "2026-02-28", coin: 2 }),
      entry({ memberId: "a", dateKey: "2026-03-01", coin: 100 }),
    ];
    const [row] = periodTotals({
      entries,
      memberIds: ["a"],
      fromKey: "2026-02-01",
      toKey: "2026-02-31",
    });
    expect(row).toEqual({ memberId: "a", coins: 3, done: 2 });
  });

  it("ignores pending and rejected entries", () => {
    const entries = [
      entry({ memberId: "a", dateKey: "2026-08-10", coin: 3, status: "pending" }),
      entry({ memberId: "a", dateKey: "2026-08-10", coin: 5, status: "rejected" }),
    ];
    const [row] = periodTotals({
      entries,
      memberIds: ["a"],
      fromKey: "2026-08-10",
      toKey: "2026-08-16",
    });
    expect(row).toEqual({ memberId: "a", coins: 0, done: 0 });
  });

  it("drops entries left behind by someone who is no longer a member", () => {
    const entries = [entry({ memberId: "gone", dateKey: "2026-08-10", coin: 9 })];
    expect(
      periodTotals({ entries, memberIds: ["a"], fromKey: "2026-08-10", toKey: "2026-08-16" }),
    ).toEqual([{ memberId: "a", coins: 0, done: 0 }]);
  });
});

describe("earnedTotals", () => {
  it("reads the lifetime total, not the spendable one", () => {
    // `b` has traded every coin away; the board must still show the work.
    const balances = [balance("a", 4, 40), balance("b", 0, 90)];
    expect(earnedTotals(balances, ["a", "b"])).toEqual([
      { memberId: "a", coins: 40 },
      { memberId: "b", coins: 90 },
    ]);
  });

  it("gives a member with no balance document a zero", () => {
    expect(earnedTotals([], ["a"])).toEqual([{ memberId: "a", coins: 0 }]);
  });
});
