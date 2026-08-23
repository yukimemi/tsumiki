import { useState } from "react";
import type { JSX } from "react";

import { useUid } from "../auth/context";
import { CommentThread } from "../components/CommentThread";
import { TaskRow } from "../components/TaskRow";
import {
  Avatar,
  Badge,
  Card,
  CoinAmount,
  EmptyState,
  IconButton,
  ProgressRing,
  Sheet,
  Skeleton,
} from "../components/ui";
import {
  completeTask,
  undoEntry,
  useEntriesForDate,
  useRecentEntries,
} from "../data/entries";
import { useTasks } from "../data/tasks";
import { useEffects } from "../effects/context";
import { useHousehold } from "../household/context";
import { addDaysKey, formatDateJa, nowHm, todayKey } from "../lib/date";
import type { Entry } from "../types";
import { progressOf, todayRowsFor } from "./today";
import type { TodayRow } from "./today";
import { useAction } from "./useAction";

/**
 * One person, one day. The whole screen is a list of big taps: everything a
 * child needs is the row itself, and everything a parent needs beyond that is
 * the member switcher and the day arrows.
 *
 * A future day is shown but frozen. Letting a child tick tomorrow off today
 * would break both the streak and the point of the app, and a disabled row
 * with one line of explanation is kinder than an arrow that refuses to move.
 */
export function TodayScreen(): JSX.Element {
  const uid = useUid();
  const { household, householdId, members, isParent } = useHousehold();
  const { celebrate, combo } = useEffects();
  const action = useAction();

  const today = todayKey();
  const [dateKey, setDateKey] = useState(today);
  const [pickedMemberId, setPickedMemberId] = useState(uid);
  // The comment sheet remembers which task it was opened for, not the entry
  // itself: the entry is re-derived below, so an undo while the sheet is open
  // closes it instead of leaving a thread hanging off a deleted completion.
  const [commentsTaskId, setCommentsTaskId] = useState<string | null>(null);

  // A parent who switched to someone who has since left falls back to self.
  const shownMemberId = members.some((member) => member.uid === pickedMemberId)
    ? pickedMemberId
    : uid;
  const shownMember =
    members.find((member) => member.uid === shownMemberId) ?? null;
  const isSelf = shownMemberId === uid;
  const isFuture = dateKey > today;

  const tasks = useTasks(householdId);
  const dayEntries = useEntriesForDate(householdId, dateKey);
  const recentEntries = useRecentEntries(householdId);

  // A `once` task retires as soon as it has an entry on ANY day, so the row
  // builder is fed more than the shown day. The recent window is the
  // practical bound on that check: a one-off finished further back than the
  // last few dozen entries drops out of view and reappears as a todo.
  const entryById = new Map<string, Entry>();
  for (const entry of recentEntries.data) entryById.set(entry.id, entry);
  for (const entry of dayEntries.data) entryById.set(entry.id, entry);

  const rows = todayRowsFor({
    tasks: tasks.data,
    entries: [...entryById.values()],
    memberId: shownMemberId,
    dateKey,
    todayKey: today,
    nowHm: nowHm(),
  });

  const progress = progressOf(rows);
  const coinYen = household?.coinYen ?? 0;
  const loading = tasks.loading || dayEntries.loading;
  const loadFailed = tasks.error !== null || dayEntries.error !== null;

  const commentsRow =
    rows.find((row) => row.task.id === commentsTaskId && row.entry !== null) ??
    null;
  const commentsEntry = commentsRow?.entry ?? null;

  const handleComplete = (row: TodayRow, origin: DOMRect): void => {
    void action.run(async () => {
      const status = await completeTask(
        row.task,
        shownMemberId,
        dateKey,
        uid,
        row.entry,
      );
      celebrate("stack", { origin });
      // Pending coins are a promise, not earnings: only an approved landing
      // gets the coin flight and the shockwave.
      if (status === "approved") {
        celebrate("coinfly", { coin: row.task.coin, origin });
        celebrate("burst", { origin });
      }
    });
  };

  const handleUndo = (entry: Entry): void => {
    void action.run(async () => {
      await undoEntry(entry, uid);
      celebrate("quake");
    });
  };

  return (
    <div className="space-y-4 px-3 py-4">
      <Card>
        <div className="flex items-center gap-2">
          <IconButton
            label="まえのひ"
            onClick={() => setDateKey(addDaysKey(dateKey, -1))}
          >
            ‹
          </IconButton>

          <p className="min-w-0 flex-1 text-center">
            <span className="block text-base font-bold text-ink">
              {formatDateJa(dateKey)}
            </span>
            {dateKey === today ? (
              <span className="block text-xs font-bold text-self">きょう</span>
            ) : null}
          </p>

          <IconButton
            label="つぎのひ"
            onClick={() => setDateKey(addDaysKey(dateKey, 1))}
          >
            ›
          </IconButton>
        </div>

        {dateKey === today ? null : (
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => setDateKey(today)}
              className="min-h-tap rounded-pill border border-self/40 bg-self/10 px-4 text-sm font-bold text-self focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              きょう
            </button>
          </div>
        )}

        <div className="mt-3 flex items-center gap-3">
          <ProgressRing
            value={progress.done}
            max={progress.total}
            size={64}
            className="flex-none"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">できた かず</p>
            <p className="text-base font-bold tabular-nums text-ink">
              {progress.done} / {progress.total}
            </p>
          </div>
          <CoinAmount
            coins={progress.coins}
            yen={coinYen > 0 ? progress.coins * coinYen : undefined}
            className="flex-none"
          />
        </div>

        {combo >= 2 ? (
          <p className="mt-2 text-center text-sm font-bold text-coin">
            {combo}れんぞく！
          </p>
        ) : null}
      </Card>

      {isParent && members.length > 1 ? (
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label="だれの やることを みるか"
        >
          {members.map((member) => {
            const selected = member.uid === shownMemberId;
            return (
              <button
                key={member.uid}
                type="button"
                aria-pressed={selected}
                onClick={() => setPickedMemberId(member.uid)}
                className={`flex min-h-tap flex-none items-center gap-2 rounded-pill border px-3 py-1 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
                  selected
                    ? "border-self bg-self/15 text-self"
                    : "border-rule bg-panel text-muted"
                }`}
              >
                <Avatar info={member.info} size="sm" />
                <span className="max-w-[6rem] truncate">
                  {member.info.displayName}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {isSelf ? null : (
        <h2 className="text-base font-bold text-ink">
          {shownMember?.info.displayName ?? "だれか"}さんの やること
        </h2>
      )}

      {isFuture ? (
        <p className="text-sm text-muted">
          さきのひにづけは まだ つけられません
        </p>
      ) : null}

      {action.error ? (
        <p role="alert">
          <Badge tone="late">{action.error}</Badge>
        </p>
      ) : null}

      {loadFailed ? (
        <p role="alert">
          <Badge tone="late">よみこめませんでした。あとで ためしてね</Badge>
        </p>
      ) : null}

      {loading ? (
        <Skeleton rows={4} />
      ) : rows.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title="きょうのやることは ありません"
            hint={
              isParent
                ? "せってい → やること で ふやせるよ"
                : "おうちのひとが ふやしてくれるよ"
            }
            emoji="🧺"
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.task.id}>
              <TaskRow
                row={row}
                coinYen={coinYen}
                busy={action.busy || isFuture}
                canUndo={
                  row.entry !== null &&
                  (row.entry.memberId === uid || isParent) &&
                  !isFuture
                }
                onComplete={(origin) => handleComplete(row, origin)}
                onUndo={() => {
                  if (row.entry) handleUndo(row.entry);
                }}
                onOpenComments={() => {
                  if (row.entry) setCommentsTaskId(row.task.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={commentsEntry !== null}
        onClose={() => setCommentsTaskId(null)}
        title={commentsRow?.task.title ?? "コメント"}
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
    </div>
  );
}
