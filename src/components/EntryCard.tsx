import type { JSX } from "react";

import { formatWhenJa } from "../lib/when";
import type { Entry, MemberInfo, Role } from "../types";
import { Avatar, Badge, Button, Card, CoinAmount } from "./ui";

/**
 * One completion on a timeline. Everything it needs arrives by prop, so the
 * family screen, the records screen, or any future surface can render the
 * same card without this component knowing where it lives.
 */

const STATUS_PILL: Record<
  Entry["status"],
  { tone: "wait" | "done" | "neutral"; text: string }
> = {
  pending: { tone: "wait", text: "しょうにんまち" },
  approved: { tone: "done", text: "できた" },
  rejected: { tone: "neutral", text: "もういちど" },
};

export function EntryCard(props: {
  entry: Entry;
  /** Null when the member has left the household; the entry stays. */
  member: { uid: string; role: Role; info: MemberInfo } | null;
  coinYen: number;
  canDecide: boolean;
  onApprove?(origin: DOMRect): void;
  onReject?(): void;
  onOpenComments(): void;
  /** A comment from someone else that this member has not opened yet. */
  unread?: boolean;
  compact?: boolean;
}): JSX.Element {
  const {
    entry,
    member,
    coinYen,
    canDecide,
    unread = false,
    compact = false,
  } = props;
  const pill = STATUS_PILL[entry.status];
  const deciding = canDecide && entry.status === "pending";

  return (
    <Card padded={false} className="overflow-hidden">
      <button
        type="button"
        onClick={() => props.onOpenComments()}
        aria-label={`${entry.taskTitle} の コメントを みる`}
        className={`flex w-full items-center gap-3 text-left transition-colors active:bg-sunk ${
          compact ? "px-3 py-2" : "px-4 py-3"
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-self`}
      >
        {member ? (
          <Avatar info={member.info} size={compact ? "sm" : "md"} />
        ) : (
          <span className="avatar h-10 w-10 text-lg" aria-hidden="true">
            👤
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-muted">
            <span className="font-bold text-ink">
              {member?.info.displayName ?? "だれか"}
            </span>
            {" さんが "}
            {formatWhenJa(entry)}
          </span>
          <span
            className={`mt-0.5 block truncate font-bold text-ink ${
              compact ? "text-sm" : "text-base"
            }`}
          >
            <span aria-hidden="true">{entry.taskEmoji} </span>
            {entry.taskTitle}
          </span>
        </span>

        <CoinAmount
          coins={entry.coin}
          yen={compact || coinYen <= 0 ? undefined : entry.coin * coinYen}
          size="sm"
          className="flex-none"
        />
      </button>

      <div
        className={`flex flex-wrap items-center gap-2 border-t border-rule ${
          compact ? "px-3 py-1.5" : "px-4 py-2"
        }`}
      >
        <Badge tone={pill.tone}>{pill.text}</Badge>

        <button
          type="button"
          onClick={() => props.onOpenComments()}
          className={`inline-flex min-h-tap items-center gap-1 rounded-pill px-2 text-sm font-bold transition-colors active:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self ${
            unread ? "text-self" : "text-muted"
          }`}
          aria-label={
            unread
              ? `あたらしい コメント ${entry.commentCount} けんを みる`
              : `コメント ${entry.commentCount} けんを みる`
          }
        >
          <span aria-hidden="true">💬</span>
          {entry.commentCount > 0 ? entry.commentCount : "コメント"}
          {unread ? (
            <span
              aria-hidden="true"
              className="ml-0.5 h-2 w-2 rounded-pill bg-self shadow-glow-self"
            />
          ) : null}
        </button>

        {deciding ? (
          <span className="ml-auto flex gap-2">
            {props.onReject ? (
              <Button variant="ghost" onClick={() => props.onReject?.()}>
                まだかな
              </Button>
            ) : null}
            {props.onApprove ? (
              <Button
                variant="primary"
                onClick={(event) =>
                  props.onApprove?.(event.currentTarget.getBoundingClientRect())
                }
              >
                よくできました
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
