/** Consecutive-day counts over approved entries. */

import { addDaysKey } from "./date";

export type StreakStat = {
  /** Days in the streak that is still alive. 0 once it is broken. */
  current: number;
  /** Longest run ever recorded. */
  best: number;
  /** Most recent day with at least one approved entry. */
  lastKey: string | null;
};

/**
 * A day counts once no matter how many tasks were approved on it, so several
 * entries for the same date collapse.
 *
 * `current` deliberately survives an untouched today: at 07:00 nobody has
 * done anything yet and resetting the number to 0 would read as a punishment.
 * It counts up to yesterday until today is actually recorded.
 */
export function streakFor(
  approvedDateKeys: Iterable<string>,
  todayKeyValue: string,
): StreakStat {
  const days = new Set(approvedDateKeys);
  if (days.size === 0) return { current: 0, best: 0, lastKey: null };

  // Date keys sort chronologically as plain strings.
  const sorted = [...days].sort();

  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = addDaysKey(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1;
    if (run > best) best = run;
  }

  let cursor: string | null = null;
  if (days.has(todayKeyValue)) cursor = todayKeyValue;
  else if (days.has(addDaysKey(todayKeyValue, -1)))
    cursor = addDaysKey(todayKeyValue, -1);

  let current = 0;
  while (cursor !== null && days.has(cursor)) {
    current++;
    cursor = addDaysKey(cursor, -1);
  }

  return { current, best, lastKey: sorted[sorted.length - 1] };
}
