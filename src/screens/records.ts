// Pure aggregation for the records screen. No React, no Firebase: entries in,
// numbers out, so the whole thing is testable without a renderer.
//
// Only `approved` entries count anywhere in this module. A pending entry has
// not happened yet and a rejected one never did; showing either in a calendar
// or a streak would teach the wrong lesson.

import type { Entry } from "../types";
import { monthGrid, monthKeyOf } from "../lib/date";

export type DayCell = {
  dateKey: string;
  count: number;
  coins: number;
  inMonth: boolean;
};

/** Approved entries for one member, or the whole family when null. */
function approvedFor(entries: Entry[], memberId: string | null): Entry[] {
  return entries.filter(
    (entry) =>
      entry.status === "approved" &&
      (memberId === null || entry.memberId === memberId),
  );
}

/**
 * Six rows of seven cells, straight from `monthGrid()` — padding days from
 * the neighbouring months included and flagged `inMonth: false` so the
 * calendar can dim them without recomputing the grid.
 */
export function dayCellsFor(input: {
  monthKey: string;
  entries: Entry[];
  /** null = the whole family. */
  memberId: string | null;
}): DayCell[][] {
  const approved = approvedFor(input.entries, input.memberId);

  // Bucket once; the grid walk is then a lookup per day.
  const byDay = new Map<string, { count: number; coins: number }>();
  for (const entry of approved) {
    const bucket = byDay.get(entry.dateKey) ?? { count: 0, coins: 0 };
    bucket.count += 1;
    bucket.coins += entry.coin;
    byDay.set(entry.dateKey, bucket);
  }

  return monthGrid(input.monthKey).map((week) =>
    week.map((dateKey) => {
      const bucket = byDay.get(dateKey);
      return {
        dateKey,
        count: bucket?.count ?? 0,
        coins: bucket?.coins ?? 0,
        inMonth: monthKeyOf(dateKey) === input.monthKey,
      };
    }),
  );
}

/** Coins earned by approved entries, for one member or the whole family. */
export function coinsInRange(
  entries: Entry[],
  memberId: string | null,
): number {
  return approvedFor(entries, memberId).reduce((sum, entry) => sum + entry.coin, 0);
}

/**
 * The days a member has at least one approved entry, de-duplicated — the
 * exact input `streakFor()` wants. String sort is chronological, so the
 * result comes out in ascending order for free.
 */
export function approvedDateKeys(entries: Entry[], memberId: string): string[] {
  const days = new Set<string>();
  for (const entry of approvedFor(entries, memberId)) {
    days.add(entry.dateKey);
  }
  return [...days].sort();
}

/**
 * One point per key in `weekKeys`, in that order, with zeroes for quiet
 * days — the bar strip sizes itself off the max and must not guess.
 */
export function weeklySeries(input: {
  weekKeys: string[];
  entries: Entry[];
  /** null = the whole family. */
  memberId: string | null;
}): { dateKey: string; count: number; coins: number }[] {
  const approved = approvedFor(input.entries, input.memberId);

  const byDay = new Map<string, { count: number; coins: number }>();
  for (const entry of approved) {
    const bucket = byDay.get(entry.dateKey) ?? { count: 0, coins: 0 };
    bucket.count += 1;
    bucket.coins += entry.coin;
    byDay.set(entry.dateKey, bucket);
  }

  return input.weekKeys.map((dateKey) => {
    const bucket = byDay.get(dateKey);
    return {
      dateKey,
      count: bucket?.count ?? 0,
      coins: bucket?.coins ?? 0,
    };
  });
}
