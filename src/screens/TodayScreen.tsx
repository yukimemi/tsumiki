import { useState } from "react";
import type { JSX } from "react";

import { useUid } from "../auth/context";
import { CommentThread } from "../components/CommentThread";
import { EntryPhoto } from "../components/EntryPhoto";
import { PhotoButton } from "../components/PhotoButton";
import { TaskRow } from "../components/TaskRow";
import {
  Avatar,
  Badge,
  Button,
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
  nextEntryId,
  setEntryPhoto,
  undoEntry,
  useEntriesForDate,
  useRecentEntries,
} from "../data/entries";
import { uploadEntryPhoto } from "../data/photos";
import { useTasks } from "../data/tasks";
import { useEffects } from "../effects/context";
import { useHousehold } from "../household/context";
import { addDaysKey, formatDateJa, nowHm, todayKey } from "../lib/date";
import { assigneeLabelJa, repeatLabelJa } from "../lib/taskLabels";
import type { Entry } from "../types";
import { UNFILED_LABEL, groupTodayRows, progressOf, todayRowsFor } from "./today";
import type { TodayGroup, TodayRow } from "./today";
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
  const isPro = household?.plan === "pro";
  const { celebrate, combo } = useEffects();
  const action = useAction();
  const photoAction = useAction();

  const today = todayKey();
  const [dateKey, setDateKey] = useState(today);
  const [pickedMemberId, setPickedMemberId] = useState(uid);
  // The comment sheet remembers which task it was opened for, not the entry
  // itself: the entry is re-derived below, so an undo while the sheet is open
  // closes it instead of leaving a thread hanging off a deleted completion.
  const [commentsTaskId, setCommentsTaskId] = useState<string | null>(null);
  // Which task's detail sheet is open. Held as an id, like the comments sheet,
  // so the row is re-derived from live data and the sheet follows a completion
  // or an undo instead of showing a stale snapshot.
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  // Where the circle was when a photo-required task was tapped, so the
  // celebration still flies out of the row and not the sheet's button.
  const [pendingPhotoOrigin, setPendingPhotoOrigin] = useState<DOMRect | null>(
    null,
  );
  // Only the groups the child has actually tapped. Everything else follows
  // the rule below, so a group that finishes while the screen is open folds
  // itself away — and one that was deliberately opened stays open.
  const [groupOverrides, setGroupOverrides] = useState<Record<string, boolean>>(
    {},
  );

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

  const groups = groupTodayRows(rows);
  // A family that has never filed anything sees exactly what it saw before:
  // one unnamed pile, no headers. Grouping should arrive when it is asked
  // for, not as a row of "そのほか" over an unchanged list.
  const showGroups = groups.length > 1 || groups[0]?.label !== UNFILED_LABEL;
  // Done groups fold away, which is the point: the list shrinks as the day
  // goes, exactly when a long list stops being useful.
  // Keyed by `group.key`, not by the header text: two groups can display the
  // same name, and folding one must not fold the other.
  const groupOpen = (group: TodayGroup): boolean =>
    groupOverrides[group.key] ?? !(group.total > 0 && group.done === group.total);

  const progress = progressOf(rows);
  const coinYen = household?.coinYen ?? 0;
  const loading = tasks.loading || dayEntries.loading;
  const loadFailed = tasks.error !== null || dayEntries.error !== null;

  const commentsRow =
    rows.find((row) => row.task.id === commentsTaskId && row.entry !== null) ??
    null;
  const commentsEntry = commentsRow?.entry ?? null;

  const detailRow = rows.find((row) => row.task.id === detailTaskId) ?? null;

  /** One row, identical whether the list is grouped or flat. */
  const taskItem = (row: TodayRow): JSX.Element => (
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
        onComplete={(origin) => requestComplete(row, origin)}
        onUndo={() => {
          if (row.entry) handleUndo(row.entry);
        }}
        onOpenDetail={() => setDetailTaskId(row.task.id)}
        onOpenComments={() => {
          if (row.entry) setCommentsTaskId(row.task.id);
        }}
      />
    </li>
  );

  const handleComplete = (
    row: TodayRow,
    origin: DOMRect,
    file?: File,
  ): void => {
    void action.run(async () => {
      // Upload before the entry write. A path recorded for an object that
      // never arrived would render as a permanently broken photo. Keyed to
      // whichever slot this tap will land on, so two completions on the
      // same day never share — or clobber — one photo.
      const targetId = nextEntryId(row.task, shownMemberId, dateKey, row.entries);
      const photoPath =
        file && targetId
          ? await uploadEntryPhoto({
              householdId: row.task.householdId,
              entryId: targetId,
              file,
            })
          : undefined;

      const status = await completeTask(
        row.task,
        shownMemberId,
        dateKey,
        uid,
        row.entries,
        photoPath,
      );
      celebrate("stack", { origin });
      // Pending coins are a promise, not earnings: only an approved landing
      // gets the coin flight and the shockwave. A pending one still gets an
      // answer back — the wish — so a tap is never met with silence.
      if (status === "approved") {
        celebrate("coinfly", { coin: row.task.coin, origin });
        celebrate("burst", { origin });
      } else {
        celebrate("wish", { origin });
      }
    });
  };

  /**
   * A chore that insists on a photo cannot be finished by the circle alone —
   * the tap opens the detail sheet, where the camera button lives. Applies to
   * every tap that will actually create a new completion (`todo`/`late`),
   * not just the day's first one: a `dailyLimit` task still wants its proof
   * on the second, third, ... rep.
   */
  const requestComplete = (row: TodayRow, origin: DOMRect): void => {
    if (
      row.task.needsPhoto &&
      (row.state === "todo" || row.state === "late")
    ) {
      setPendingPhotoOrigin(origin);
      setDetailTaskId(row.task.id);
      return;
    }
    handleComplete(row, origin);
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
      ) : !showGroups ? (
        <ul className="space-y-2">{rows.map(taskItem)}</ul>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const open = groupOpen(group);
            return (
              <section key={group.key} aria-label={group.label}>
                <h2 className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                      setGroupOverrides((prev) => ({
                        ...prev,
                        [group.key]: !open,
                      }))
                    }
                    className="flex min-h-tap flex-1 items-center gap-2 rounded-card px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self"
                  >
                    <span aria-hidden="true" className="text-muted">
                      {open ? "▾" : "▸"}
                    </span>
                    <span className="min-w-0 truncate text-base font-bold text-ink">
                      {group.label}
                    </span>
                    {/* Grouping can push a late chore below the fold, so the
                        header carries the fact up to where it is visible. */}
                    {group.hasLate ? <Badge tone="late">おくれてる</Badge> : null}
                    <span className="ml-auto pr-1 text-sm tabular-nums text-muted">
                      {group.done}/{group.total}
                    </span>
                  </button>
                </h2>
                {open ? (
                  <ul className="mt-1 space-y-2">{group.rows.map(taskItem)}</ul>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      <Sheet
        open={detailRow !== null}
        onClose={() => setDetailTaskId(null)}
        title="やることの しょうさい"
      >
        {detailRow ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex-none text-4xl" aria-hidden="true">
                {detailRow.task.emoji}
              </span>
              {/* No clamp here — reading the whole name is the point. */}
              <h3 className="min-w-0 flex-1 text-lg font-bold leading-snug text-ink">
                {detailRow.task.title}
              </h3>
            </div>

            {detailRow.task.note ? (
              <p className="whitespace-pre-wrap rounded-card bg-sunk p-3 text-sm leading-relaxed text-ink">
                {detailRow.task.note}
              </p>
            ) : null}

            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">もらえる コイン</dt>
                <dd>
                  <CoinAmount
                    coins={detailRow.task.coin}
                    yen={
                      coinYen > 0 ? detailRow.task.coin * coinYen : undefined
                    }
                    size="sm"
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">くりかえし</dt>
                <dd className="font-bold text-ink">
                  {repeatLabelJa(detailRow.task.repeat)}
                </dd>
              </div>
              {detailRow.dailyProgress ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">きょうの かいすう</dt>
                  <dd className="font-bold tabular-nums text-ink">
                    {detailRow.dailyProgress.done} /{" "}
                    {detailRow.dailyProgress.count} かい
                  </dd>
                </div>
              ) : null}
              {detailRow.task.dueTime ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">じかん</dt>
                  <dd className="font-bold text-ink">
                    {detailRow.task.dueTime} まで
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">だれが やる</dt>
                <dd className="font-bold text-ink">
                  {assigneeLabelJa(detailRow.task, members)}
                </dd>
              </div>
              {detailRow.task.needsApproval ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">しょうにん</dt>
                  <dd>
                    <Badge tone="wait">おうちのひとが みてから</Badge>
                  </dd>
                </div>
              ) : null}
            </dl>

            {detailRow.entry?.rejectReason ? (
              <p className="rounded-card border border-rule bg-sunk p-3 text-sm text-ink">
                <span className="font-bold">もういちど: </span>
                {detailRow.entry.rejectReason}
              </p>
            ) : null}

            {detailRow.entry?.photoPath ? (
              <EntryPhoto
                path={detailRow.entry.photoPath}
                alt={`${detailRow.task.title} の しゃしん`}
                size="full"
              />
            ) : null}

            <div className="flex flex-col gap-2">
              {(detailRow.state === "todo" || detailRow.state === "late") &&
              !isFuture ? (
                detailRow.task.needsPhoto && isPro ? (
                  <>
                    <p className="text-sm text-muted">
                      しゃしんを とると おわりになります。
                    </p>
                    <PhotoButton
                      label="しゃしんを とって やったにする"
                      busy={action.busy}
                      onPick={(file) => {
                        const origin =
                          pendingPhotoOrigin ??
                          document
                            .querySelector("#coin-target")
                            ?.getBoundingClientRect() ??
                          new DOMRect(0, 0, 0, 0);
                        setDetailTaskId(null);
                        setPendingPhotoOrigin(null);
                        handleComplete(detailRow, origin, file);
                      }}
                    />
                  </>
                ) : (
                  <Button
                    block
                    disabled={action.busy}
                    onClick={(event) => {
                      const origin = event.currentTarget.getBoundingClientRect();
                      setDetailTaskId(null);
                      handleComplete(detailRow, origin);
                    }}
                  >
                    やったにする
                  </Button>
                )
              ) : null}

              {/* Any completion may carry a photo, required or not — and a
                  blurry one can be retaken while it is still waiting. */}
              {detailRow.entry && !isFuture && isPro ? (
                <PhotoButton
                  label={
                    detailRow.entry.photoPath
                      ? "しゃしんを とりなおす"
                      : "しゃしんを つける"
                  }
                  busy={photoAction.busy}
                  onPick={(file) => {
                    const target = detailRow.entry;
                    if (!target) return;
                    void photoAction.run(() => setEntryPhoto(target, file));
                  }}
                />
              ) : null}

              {photoAction.error ? (
                <Badge tone="late">{photoAction.error}</Badge>
              ) : null}

              {detailRow.entry && !isFuture ? (
                <Button
                  variant="ghost"
                  block
                  disabled={action.busy}
                  onClick={() => {
                    const target = detailRow.entry;
                    setDetailTaskId(null);
                    if (target) handleUndo(target);
                  }}
                >
                  とりけす
                </Button>
              ) : null}

              {detailRow.entry ? (
                <Button
                  variant="ghost"
                  block
                  onClick={() => {
                    setDetailTaskId(null);
                    setCommentsTaskId(detailRow.task.id);
                  }}
                >
                  コメントを みる
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Sheet>

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
