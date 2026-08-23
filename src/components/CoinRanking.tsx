import type { CSSProperties, JSX } from "react";

import type { HouseholdMember } from "../household/context";
import type { RankPeriod, RankRow } from "../screens/ranking";
import {
  Avatar,
  Badge,
  Card,
  CoinAmount,
  EmptyState,
  SegmentedControl,
  Skeleton,
} from "./ui";
import type { SegmentedOption } from "./ui";

/**
 * The board, and the tone it is written in.
 *
 * A ranking in a family app is one bad sentence away from being a machine for
 * making the youngest child feel slow, so every line here points forward:
 * a member on top is told they are on top, and everyone else is told the one
 * number that would move them up. Nothing counts down from the leader, nothing
 * is labelled last, and a member on zero still gets their row.
 *
 * The board deliberately ignores the member filter on the screen around it —
 * a ranking of one person is not a ranking — the same way the family screen's
 * summary sits above its filters.
 */

/** The top three get a medal; from fourth down it is the number itself. */
const MEDALS: readonly string[] = ["🥇", "🥈", "🥉"];

const PERIOD_OPTIONS: readonly SegmentedOption<RankPeriod>[] = [
  { value: "week", label: "こんしゅう" },
  { value: "month", label: "こんげつ" },
  { value: "all", label: "ずっと" },
];

export type CoinRankingProps = {
  rows: RankRow[];
  members: HouseholdMember[];
  currentUid: string;
  period: RankPeriod;
  onPeriod(next: RankPeriod): void;
  loading?: boolean;
};

export function CoinRanking({
  rows,
  members,
  currentUid,
  period,
  onPeriod,
  loading = false,
}: CoinRankingProps): JSX.Element {
  const memberOf = (memberId: string): HouseholdMember | null =>
    members.find((member) => member.uid === memberId) ?? null;

  // Nobody has earned anything yet in this window. Ranking zeroes against each
  // other would hand out a medal for having done nothing.
  const started = rows.some((row) => row.coins > 0);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink">コインの ランキング</h2>
        <SegmentedControl
          label="いつの ランキングを みる"
          name="ranking-period"
          value={period}
          onChange={onPeriod}
          options={PERIOD_OPTIONS}
        />
      </div>

      {loading ? (
        <Skeleton rows={3} className="mt-3" />
      ) : !started ? (
        <EmptyState
          title="まだ だれも あつめてないよ"
          hint="やることが できると ここに ならぶよ"
          emoji="🏆"
        />
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const member = memberOf(row.memberId);
            const mine = row.memberId === currentUid;
            const medal = MEDALS[row.rank - 1];
            const name = member?.info.displayName ?? "だれか";

            return (
              <li
                key={row.memberId}
                className={`flex items-center gap-3 rounded-card p-2 ${
                  mine ? "bg-self/10 ring-1 ring-self/40" : ""
                }`}
              >
                {/* The rank leads the row for a screen reader; the glyph
                    beside it is the same fact, drawn. */}
                <span className="sr-only">{row.rank}い。</span>
                <span
                  className="grid w-7 flex-none place-items-center text-lg font-bold tabular-nums text-muted"
                  aria-hidden="true"
                >
                  {medal ?? row.rank}
                </span>

                {member ? <Avatar info={member.info} size="sm" /> : null}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                      {name}
                    </p>
                    {mine ? <Badge tone="self">あなた</Badge> : null}
                    <CoinAmount coins={row.coins} size="sm" />
                  </div>

                  {/* The bar is the race made visible: everyone is measured
                      against the leader, so the leader is always full. */}
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-pill bg-sunk">
                    <div
                      className="h-full rounded-pill transition-[width] duration-300"
                      style={
                        {
                          width: `${Math.round(row.share * 100)}%`,
                          background:
                            "color-mix(in srgb, var(--coin) 75%, var(--sunk))",
                        } as CSSProperties
                      }
                    />
                  </div>

                  <p className="mt-1 text-xs text-muted">
                    {row.done === undefined ? null : `${row.done}けん · `}
                    {/* "one rank up" is not a number that always exists:
                        with a tie at the top there is a 1い and a 3い and no
                        2い. Catching up is true whatever the shape. */}
                    {row.rank === 1
                      ? "いま トップ！"
                      : `あと ${row.gapToAbove}コインで おいつくよ`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
