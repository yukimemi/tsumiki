import { useState } from "react";
import type { JSX } from "react";

import { useUid } from "../auth/context";
import { CommentThread } from "../components/CommentThread";
import { EntryCard } from "../components/EntryCard";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CoinAmount,
  EmptyState,
  SegmentedControl,
  Sheet,
  Skeleton,
  Textarea,
} from "../components/ui";
import type { SegmentedOption } from "../components/ui";
import { approveEntry, rejectEntry, useRecentEntries } from "../data/entries";
import { useEffects } from "../effects/context";
import { useHousehold } from "../household/context";
import { addDaysKey, formatDateJa, todayKey } from "../lib/date";
import type { Entry } from "../types";
import { useAction } from "./useAction";

/**
 * What the family did, newest first.
 *
 * The summary sits above the filters' reach on purpose: "I can see how
 * everyone else is doing" is the reason this screen exists, and a filter left
 * on yesterday's child must not be able to hide it.
 */

/** Shown when a parent sends a completion back without typing a reason. */
const DEFAULT_REJECT_REASON = "またこんど やろうね";

type StatusFilter = "all" | "pending" | "today";

const STATUS_OPTIONS: readonly SegmentedOption<StatusFilter>[] = [
  { value: "all", label: "すべて" },
  { value: "pending", label: "しょうにんまち" },
  { value: "today", label: "きょう" },
];

/** 「きょう」「きのう」, else the date itself. */
function groupLabel(dateKey: string, today: string): string {
  if (dateKey === today) return "きょう";
  if (dateKey === addDaysKey(today, -1)) return "きのう";
  return formatDateJa(dateKey);
}

export function FamilyScreen(): JSX.Element {
  const uid = useUid();
  const { household, householdId, members, isParent } = useHousehold();
  const { celebrate } = useEffects();
  const action = useAction();

  const today = todayKey();
  const [memberFilter, setMemberFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Both sheets hold an id, not an entry: the entry is re-read from the live
  // list below, so an approval landing while a sheet is open is reflected in
  // it rather than frozen at the moment it was tapped.
  const [commentsEntryId, setCommentsEntryId] = useState<string | null>(null);
  const [rejectingEntryId, setRejectingEntryId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const recent = useRecentEntries(householdId);
  const coinYen = household?.coinYen ?? 0;

  const commentsEntry =
    recent.data.find((entry) => entry.id === commentsEntryId) ?? null;
  const rejectingEntry =
    recent.data.find((entry) => entry.id === rejectingEntryId) ?? null;

  // Today, per member, straight off the same subscription the timeline uses.
  // Only approved entries count: pending coins have not been earned yet.
  const summary = members.map((member) => {
    let done = 0;
    let coins = 0;
    for (const entry of recent.data) {
      if (entry.memberId !== member.uid) continue;
      if (entry.dateKey !== today || entry.status !== "approved") continue;
      done += 1;
      coins += entry.coin;
    }
    return { member, done, coins };
  });

  const memberOptions: SegmentedOption<string>[] = [
    { value: "all", label: "みんな" },
    ...members.map((member) => ({
      value: member.uid,
      label: member.info.displayName,
    })),
  ];

  const visible = recent.data.filter((entry) => {
    if (memberFilter !== "all" && entry.memberId !== memberFilter) return false;
    if (statusFilter === "pending") return entry.status === "pending";
    if (statusFilter === "today") return entry.dateKey === today;
    return true;
  });

  // The query already sorts by completedAt descending, so walking it in order
  // yields the days in descending order too, each group newest-first inside.
  const groups = new Map<string, Entry[]>();
  for (const entry of visible) {
    const group = groups.get(entry.dateKey);
    if (group) group.push(entry);
    else groups.set(entry.dateKey, [entry]);
  }

  const handleApprove = (entry: Entry, origin: DOMRect): void => {
    void action.run(async () => {
      await approveEntry(entry, uid);
      celebrate("pop", { origin });
      celebrate("coinfly", { coin: entry.coin, origin });
    });
  };

  const handleReject = (entry: Entry): void => {
    void action.run(async () => {
      await rejectEntry(entry, uid, rejectReason.trim() || DEFAULT_REJECT_REASON);
      celebrate("quake");
      setRejectingEntryId(null);
      setRejectReason("");
    });
  };

  return (
    <div className="space-y-4 px-3 py-4">
      <Card>
        <h2 className="text-base font-bold text-ink">きょうの みんな</h2>
        {recent.loading ? (
          <Skeleton rows={2} className="mt-2" />
        ) : summary.length === 0 ? (
          <p className="mt-2 text-sm text-muted">まだ だれも いません</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {summary.map((row) => (
              <li key={row.member.uid} className="flex items-center gap-3">
                <Avatar info={row.member.info} size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                  {row.member.info.displayName}
                </p>
                <span className="text-sm tabular-nums text-muted">
                  {row.done}こ できた
                </span>
                <CoinAmount coins={row.coins} size="sm" className="flex-none" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="space-y-2">
        <SegmentedControl
          value={memberFilter}
          options={memberOptions}
          onChange={setMemberFilter}
          label="だれの きろくを みるか"
        />
        <SegmentedControl<StatusFilter>
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={setStatusFilter}
          label="どの きろくを みるか"
        />
      </div>

      {action.error ? (
        <p role="alert">
          <Badge tone="late">{action.error}</Badge>
        </p>
      ) : null}

      {recent.error ? (
        <p role="alert">
          <Badge tone="late">よみこめませんでした。あとで ためしてね</Badge>
        </p>
      ) : null}

      {recent.loading ? (
        <Skeleton rows={4} />
      ) : visible.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title="まだ きろくが ありません"
            hint="やることが できると ここに ならぶよ"
            emoji="📖"
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {[...groups].map(([dateKey, entries]) => (
            <section key={dateKey} aria-label={`${groupLabel(dateKey, today)}の きろく`}>
              <h3 className="sticky top-0 z-10 -mx-3 mb-2 bg-paper/95 px-3 py-1 text-sm font-bold text-muted backdrop-blur">
                {groupLabel(dateKey, today)}
              </h3>
              <ul className="space-y-2">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <EntryCard
                      entry={entry}
                      member={
                        members.find(
                          (member) => member.uid === entry.memberId,
                        ) ?? null
                      }
                      coinYen={coinYen}
                      canDecide={isParent}
                      onApprove={
                        isParent
                          ? (origin) => handleApprove(entry, origin)
                          : undefined
                      }
                      onReject={
                        isParent
                          ? () => {
                              setRejectReason("");
                              setRejectingEntryId(entry.id);
                            }
                          : undefined
                      }
                      onOpenComments={() => setCommentsEntryId(entry.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Sheet
        open={commentsEntry !== null}
        onClose={() => setCommentsEntryId(null)}
        title={commentsEntry?.taskTitle ?? "コメント"}
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
        onClose={() => setRejectingEntryId(null)}
        title="もどす りゆう"
        footer={
          <Button
            block
            disabled={action.busy}
            onClick={() => {
              if (rejectingEntry) handleReject(rejectingEntry);
            }}
          >
            もどす
          </Button>
        }
      >
        <p className="mb-2 text-sm text-muted">
          コインは うごきません。りゆうは かかなくても だいじょうぶ。
        </p>
        <Textarea
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
          placeholder={DEFAULT_REJECT_REASON}
          aria-label="もどす りゆう"
        />
      </Sheet>
    </div>
  );
}
