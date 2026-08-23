import { useState } from "react";
import type { JSX } from "react";

import type { Entry, MemberInfo, Role } from "../types";
import { Badge, Button, Card, ConfirmDialog } from "./ui";

/**
 * The parent's inbox: every completion that is waiting for a decision, oldest
 * first (the data hook already sorts it that way). Whole card is `wait`-toned —
 * that slot means exactly this.
 *
 * Bulk approval goes one by one, in order, so a failure halfway leaves a
 * coherent state: the entries before it are approved, the ones after it are
 * still waiting, and the parent is told how many did not make it.
 */
export function ApprovalQueue(props: {
  entries: Entry[];
  members: { uid: string; role: Role; info: MemberInfo }[];
  coinYen: number;
  onApprove(entry: Entry, origin: DOMRect): void;
  onReject(entry: Entry): void;
  onOpenComments(entry: Entry): void;
}): JSX.Element | null {
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  if (props.entries.length === 0) return null;

  const nameOf = (uid: string): string =>
    props.members.find((member) => member.uid === uid)?.info.displayName ??
    "だれか";

  const approveAll = async (): Promise<void> => {
    setBulkBusy(true);
    setBulkError(null);
    let failed = 0;
    for (const entry of props.entries) {
      try {
        // The handler is typed void but is async underneath; awaiting it is
        // what lets a failed write be counted instead of vanishing.
        await props.onApprove(
          entry,
          new DOMRect(window.innerWidth / 2, 120, 0, 0),
        );
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(false);
    setConfirmingBulk(false);
    if (failed > 0) {
      setBulkError(`${failed}件 うまくいきませんでした。もういちど おしてね。`);
    }
  };

  return (
    <Card className="border-wait/40 bg-wait/10">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-base font-bold text-ink">
          しょうにんまち
        </h2>
        <Badge tone="wait">{props.entries.length}</Badge>
      </div>

      <ul className="mt-2 space-y-2">
        {props.entries.map((entry) => (
          <li
            key={entry.id}
            className="rounded-card border border-wait/30 bg-panel p-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden="true">
                {entry.taskEmoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-ink">
                  {entry.taskTitle}
                </p>
                <p className="text-xs text-muted">
                  {nameOf(entry.memberId)} · {entry.coin}コイン（
                  {entry.coin * props.coinYen}円）
                </p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                size="md"
                className="flex-1"
                onClick={(event) =>
                  props.onApprove(
                    entry,
                    event.currentTarget.getBoundingClientRect(),
                  )
                }
              >
                よくできました
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => props.onReject(entry)}
              >
                みなおし
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => props.onOpenComments(entry)}
              >
                💬
                {entry.commentCount > 0 ? (
                  <span className="tabular-nums">{entry.commentCount}</span>
                ) : null}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {props.entries.length > 1 ? (
        <Button
          variant="coin"
          block
          className="mt-3"
          onClick={() => setConfirmingBulk(true)}
        >
          まとめてよくできました
        </Button>
      ) : null}

      {bulkError ? (
        <p className="mt-2">
          <Badge tone="late">{bulkError}</Badge>
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmingBulk}
        title="まとめてしょうにんする？"
        message={`${props.entries.length}件 ぜんぶ「よくできました」にします。`}
        confirmLabel="ぜんぶ よくできました"
        busy={bulkBusy}
        onConfirm={() => void approveAll()}
        onClose={() => setConfirmingBulk(false)}
      />
    </Card>
  );
}
