// Who is ahead, as numbers. No React, no Firebase: totals in, ranked rows out.
//
// This is the one place in the app where members are measured against each
// other, so the rules it encodes matter more than the arithmetic does:
//
//   - Ties share a rank. Two children on 40 coins are both second; the board
//     must not invent an order between them out of a member list's sort.
//   - Nobody is dropped for having nothing. A member with no coins yet is on
//     the board with a zero, not missing from it — being absent reads as
//     "you are not part of this", which is the opposite of the point.
//   - Every row carries the gap to the rank *above* it, never the distance
//     from the leader. "3 more and you are second" is something a child can
//     act on today; "30 behind" is only something to feel bad about.
//
// Like everywhere else, only `approved` entries count: a pending completion
// has not happened yet and a rejected one never did.

import type { Balance, Entry, LedgerEntry } from "../types";

/** Which stretch of time the board is measuring. */
export type RankPeriod = "week" | "month" | "all";

export type RankInput = {
  memberId: string;
  coins: number;
  /**
   * Completions behind the coins. Absent for the lifetime board, which is
   * read from the balance cache and has no entry count to report.
   */
  done?: number;
};

export type RankRow = RankInput & {
  /** 1-based. Ties share a rank and the next total skips it: 1, 1, 3. */
  rank: number;
  /** Coins that would reach the rank above. 0 for everyone on rank 1. */
  gapToAbove: number;
  /** coins / the leader's coins, 0..1. All zero while the leader is at 0. */
  share: number;
};

/**
 * Sorted richest first, with ranks, gaps and bar widths attached.
 *
 * Pass one row per member — including the members on zero. `sort` is stable,
 * so members level on coins keep the order they arrived in (the household's
 * own member order) instead of shuffling on every snapshot.
 */
export function rankByCoins(rows: readonly RankInput[]): RankRow[] {
  const sorted = [...rows].sort((a, b) => b.coins - a.coins);
  const leader = sorted[0]?.coins ?? 0;

  // `tierCoins` is the total shared by the rank being handed out; `aboveCoins`
  // is the total of the tier before it, which is what a gap is measured to.
  let rank = 0;
  let tierCoins: number | null = null;
  let aboveCoins: number | null = null;

  return sorted.map((row, index) => {
    if (tierCoins === null || row.coins < tierCoins) {
      aboveCoins = tierCoins;
      rank = index + 1;
      tierCoins = row.coins;
    }
    return {
      ...row,
      rank,
      gapToAbove: aboveCoins === null ? 0 : aboveCoins - row.coins,
      share: leader > 0 ? row.coins / leader : 0,
    };
  });
}

/**
 * Approved coins and completions per member between two date keys, inclusive.
 *
 * Bounds are compared as strings, which is why every stored date in tsumiki is
 * a zero-padded "YYYY-MM-DD": lexicographic order is chronological order, so a
 * whole month is `"2026-08-01"`..`"2026-08-31"` whatever the month's length.
 */
export function periodTotals(input: {
  entries: readonly Entry[];
  /** Every member of the household, so the ones on zero appear too. */
  memberIds: readonly string[];
  fromKey: string;
  toKey: string;
}): RankInput[] {
  const totals = new Map<string, RankInput>(
    input.memberIds.map((memberId) => [memberId, { memberId, coins: 0, done: 0 }]),
  );

  for (const entry of input.entries) {
    if (entry.status !== "approved") continue;
    if (entry.dateKey < input.fromKey || entry.dateKey > input.toKey) continue;
    // A member who has left the household still owns their entries; the board
    // is about the people on it now, so those rows are skipped rather than
    // added back as a nameless row.
    const row = totals.get(entry.memberId);
    if (!row) continue;
    row.coins += entry.coin;
    row.done = (row.done ?? 0) + 1;
  }

  return [...totals.values()];
}

/**
 * Lifetime earned coins per member, straight off the balance cache.
 *
 * `Balance.earned` is the right number for an all-time board precisely because
 * spending never lowers it: a child who traded their coins for pocket money
 * has not undone the work, and a board that dropped them for it would teach
 * them to hoard. Note this total also carries parent-granted bonuses, which
 * the entry-based periods above cannot see.
 */
export function earnedTotals(
  balances: readonly Balance[],
  memberIds: readonly string[],
): RankInput[] {
  return memberIds.map((memberId) => ({
    memberId,
    coins: balances.find((balance) => balance.memberId === memberId)?.earned ?? 0,
  }));
}

/**
 * Coins a member picked up outside the entry ledger — a parent's bonus grant
 * or a manual correction — for the same week/month board `periodTotals`
 * builds from entries. `task`-reason rows are the coin side of an approved
 * entry and already counted there, and `payout` only ever spends, so neither
 * belongs here. A negative `adjust` is a takeback, not something earned, so
 * only positive movements count — the same rule `Balance.earned` itself
 * follows (see `adjustCoins`).
 */
export function ledgerTotals(
  ledger: readonly LedgerEntry[],
  memberIds: readonly string[],
): RankInput[] {
  const totals = new Map<string, RankInput>(
    memberIds.map((memberId) => [memberId, { memberId, coins: 0 }]),
  );

  for (const row of ledger) {
    if (row.reason === "task" || row.reason === "payout") continue;
    if (row.delta <= 0) continue;
    const target = totals.get(row.memberId);
    if (!target) continue;
    target.coins += row.delta;
  }

  return [...totals.values()];
}

/**
 * Add a second totals board onto a first, per member — used to fold
 * `ledgerTotals` into `periodTotals` so a gift lands on the same week/month
 * board as an approved chore. Completion counts come from `a` only; a ledger
 * grant is not a completion.
 */
export function mergeTotals(a: readonly RankInput[], b: readonly RankInput[]): RankInput[] {
  const byMember = new Map(b.map((row) => [row.memberId, row]));
  return a.map((row) => ({
    ...row,
    coins: row.coins + (byMember.get(row.memberId)?.coins ?? 0),
  }));
}
