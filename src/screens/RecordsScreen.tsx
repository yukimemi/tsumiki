import { useState } from "react";
import { addMonths } from "date-fns";

import { useUid } from "../auth/context";
import { CommentThread } from "../components/CommentThread";
import { EntryCard } from "../components/EntryCard";
import { MonthCalendar } from "../components/MonthCalendar";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Sheet,
  Skeleton,
  Textarea,
} from "../components/ui";
import { approveEntry, rejectEntry, useEntriesInRange } from "../data/entries";
import { useEffects } from "../effects/context";
import { useHousehold } from "../household/context";
import {
  addDaysKey,
  dateKeyOf,
  formatDateJa,
  monthKeyOf,
  parseDateKey,
  todayKey,
  weekKeys,
  WEEKDAY_LABELS_JA,
  weekdayOfKey,
} from "../lib/date";
import { streakFor } from "../lib/streak";
import type { Entry } from "../types";
import {
  approvedDateKeys,
  dayCellsFor,
  totalsByMember,
  weeklySeries,
} from "./records";

/** How far back the streak subscription reaches. See the comment at the hook. */
const STREAK_WINDOW_DAYS = 90;

export function RecordsScreen(): JSX.Element {
  const uid = useUid();
  const { household, householdId, members, isParent } = useHousehold();
  const { celebrate } = useEffects();

  const today = todayKey();
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(today));
  const [selectedKey, setSelectedKey] = useState<string | null>(today);
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null);
  const [commentsEntry, setCommentsEntry] = useState<Entry | null>(null);
  const [rejectingEntry, setRejectingEntry] = useState<Entry | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The calendar's subscription spans the whole grid — padding days included —
  // so the dimmed days at the edges are populated too.
  const grid = monthGridFor(monthKey);
  const monthEntries = useEntriesInRange(householdId, grid[0][0], grid[5][6]);

  // The streak needs history the visible month cannot see: a run that started
  // in June is still alive in August. This second subscription covers the last
  // STREAK_WINDOW_DAYS days ending today and feeds ONLY the streak cards; the
  // calendar and the totals stay on the visible month's window. A streak older
  // than the window reads as broken — a documented, deliberate boundary.
  const streakFrom = addDaysKey(today, -(STREAK_WINDOW_DAYS - 1));
  const streakEntries = useEntriesInRange(householdId, streakFrom, today);

  const memberFilter = filterMemberId;
  const memberVisible = (entry: Entry): boolean =>
    memberFilter === null || entry.memberId === memberFilter;

  const cells = dayCellsFor({
    monthKey,
    entries: monthEntries.data,
    memberId: memberFilter,
  });

  const dayEntries = monthEntries.data.filter(
    (entry) => entry.dateKey === selectedKey && memberVisible(entry),
  );

  const monthOnly = monthEntries.data.filter(
    (entry) => monthKeyOf(entry.dateKey) === monthKey,
  );
  const totals = totalsByMember(monthOnly.filter(memberVisible));

  const series = weeklySeries({
    weekKeys: weekKeys(selectedKey ?? today),
    entries: monthEntries.data,
    memberId: memberFilter,
  });
  const seriesMax = series.reduce((max, point) => Math.max(max, point.count), 0);

  const memberOf = (memberId: string) =>
    members.find((member) => member.uid === memberId) ?? null;

  const nameOf = (memberId: string): string =>
    memberOf(memberId)?.info.displayName ?? "だれか";

  const fail = (error: unknown): never => {
    setErrorMessage(
      error instanceof Error && error.message
        ? "うまくいきませんでした。もういちど おしてね。"
        : "うまくいきませんでした。もういちど おしてね。",
    );
    celebrate("quake");
    throw error;
  };

  const handleApprove = (entry: Entry, origin: DOMRect): void => {
    void approveEntry(entry, uid)
      .then(() => {
        celebrate("pop", { origin });
        celebrate("coinfly", { coin: entry.coin, origin });
      })
      .catch(fail);
  };

  const handleRejectConfirm = (): void => {
    const entry = rejectingEntry;
    if (!entry) return;
    void rejectEntry(entry, uid, rejectReason || "またこんど やろうね")
      .then(() => {
        celebrate("quake");
        setRejectingEntry(null);
        setRejectReason("");
      })
      .catch(fail);
  };

  return (
    <div className="space-y-4 px-3 py-4">
      {errorMessage ? (
        <p role="alert">
          <Badge tone="late">{errorMessage}</Badge>
        </p>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip
          tone="self"
          selected={filterMemberId === null}
          onClick={() => setFilterMemberId(null)}
        >
          みんな
        </Chip>
        {members.map((member) => (
          <Chip
            key={member.uid}
            tone="self"
            selected={filterMemberId === member.uid}
            onClick={() => setFilterMemberId(member.uid)}
          >
            {member.info.displayName}
          </Chip>
        ))}
      </div>

      <Card>
        {monthEntries.loading ? (
          <Skeleton rows={6} />
        ) : (
          <MonthCalendar
            monthKey={monthKey}
            cells={cells}
            selectedKey={selectedKey}
            todayKey={today}
            onSelect={setSelectedKey}
            onMonth={(delta) =>
              setMonthKey(
                monthKeyOf(
                  dateKeyOf(addMonths(parseDateKey(`${monthKey}-01`), delta)),
                ),
              )
            }
          />
        )}
      </Card>

      <section aria-label="えらんだひの きろく">
        <h2 className="mb-2 text-base font-bold text-ink">
          {selectedKey ? formatDateJa(selectedKey) : ""}の きろく
        </h2>
        {monthEntries.loading ? (
          <Skeleton rows={2} />
        ) : dayEntries.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              title="このひは まだ ないよ"
              hint="できたことが あると ここに でるよ"
              emoji="🗓️"
            />
          </Card>
        ) : (
          <ul className="space-y-2">
            {dayEntries.map((entry) => (
              <li key={entry.id}>
                <EntryCard
                  entry={entry}
                  member={memberOf(entry.memberId)}
                  coinYen={household?.coinYen ?? 0}
                  canDecide={isParent && entry.status === "pending"}
                  compact
                  onApprove={
                    isParent && entry.status === "pending"
                      ? (origin) => handleApprove(entry, origin)
                      : undefined
                  }
                  onReject={
                    isParent && entry.status === "pending"
                      ? () => setRejectingEntry(entry)
                      : undefined
                  }
                  onOpenComments={() => setCommentsEntry(entry)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <h2 className="text-base font-bold text-ink">つづけて できたひ</h2>
        <ul className="mt-2 space-y-3">
          {members.map((member) => {
            const stat = streakFor(
              approvedDateKeys(streakEntries.data, member.uid),
              today,
            );
            return (
              <li key={member.uid} className="flex items-center gap-3">
                <Avatar info={member.info} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">
                    {member.info.displayName}
                  </p>
                  <p className="text-sm text-muted">
                    いま {stat.current}にち つづいている · さいこう {stat.best}
                    にち
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-ink">このしゅうの できたかず</h2>
        <div
          className="mt-3 grid grid-cols-7 items-end gap-2"
          role="img"
          aria-label={`このしゅうは ぜんぶで ${series.reduce((sum, point) => sum + point.count, 0)}件 できた`}
        >
          {series.map((point, i) => {
            const height =
              seriesMax > 0 ? Math.max(12, (72 * point.count) / seriesMax) : 4;
            const weekday = weekdayOfKey(point.dateKey);
            return (
              <div key={point.dateKey} className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold tabular-nums text-muted">
                  {point.count > 0 ? point.count : ""}
                </span>
                <div
                  className="w-full rounded-t-card"
                  style={{
                    height: `${Math.round(height)}px`,
                    background:
                      point.count > 0
                        ? "color-mix(in srgb, var(--done) 70%, var(--sunk))"
                        : "var(--sunk)",
                  }}
                />
                <span
                  className={`text-xs ${
                    point.dateKey === (selectedKey ?? today)
                      ? "font-bold text-self"
                      : "text-muted"
                  }`}
                >
                  {WEEKDAY_LABELS_JA[i] ?? WEEKDAY_LABELS_JA[weekday]}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-ink">このつきの あつめたコイン</h2>
        {totals.length === 0 ? (
          <p className="mt-2 text-sm text-muted">このつきは まだ ないよ</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {totals.map((row) => (
              <li key={row.memberId} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                  {nameOf(row.memberId)}
                </span>
                <span className="text-sm tabular-nums text-muted">
                  {row.done}件
                </span>
                <Badge tone="coin">{row.coins}コイン</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet
        open={commentsEntry !== null}
        onClose={() => setCommentsEntry(null)}
        title="コメント"
      >
        {commentsEntry ? (
          <CommentThread
            entry={commentsEntry}
            members={members}
            currentUid={uid}
            canModerate={isParent}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={rejectingEntry !== null}
        onClose={() => setRejectingEntry(null)}
        title="みなおしの りゆう"
        footer={
          <Button block onClick={handleRejectConfirm}>
            みなおしに する
          </Button>
        }
      >
        <p className="mb-2 text-sm text-muted">
          コインは うごきません。やさしく つたえよう。
        </p>
        <Textarea
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
          placeholder="またこんど やろうね"
          aria-label="みなおしの りゆう"
        />
      </Sheet>
    </div>
  );
}

/** monthGrid is the single source; aliased here only to keep the JSX line short. */
function monthGridFor(monthKey: string): string[][] {
  // Deferred to the lib so the padding rule (always six rows) lives in one place.
  return monthGrid(monthKey);
}
import { monthGrid } from "../lib/date";
import type { JSX } from "react";
