import { useState } from "react";
import type { JSX, MouseEvent as ReactMouseEvent } from "react";

import { STACK_MS } from "../effects/effects";
import type { TodayRow } from "../screens/today";
import { CoinAmount, IconButton } from "./ui";
import type { Tone } from "./ui";

/**
 * One task on the Today screen: a big tappable block a small finger cannot
 * miss. The main surface is a real button; undo and comments are separate
 * small buttons next to it, because buttons inside buttons are not HTML and
 * long-press is a gesture a child will never find.
 */

const STATE_PILL: Record<
  TodayRow["state"],
  { tone: Tone; text: string } | null
> = {
  todo: null,
  late: { tone: "late", text: "おそくなった" },
  pending: { tone: "wait", text: "おねがいちゅう" },
  approved: { tone: "done", text: "できた！" },
  rejected: { tone: "neutral", text: "もういちど" },
};

export function TaskRow(props: {
  row: TodayRow;
  coinYen: number;
  /** A write is in flight, or the day shown may not be written to. */
  busy?: boolean;
  canUndo: boolean;
  onComplete(origin: DOMRect): void;
  onUndo(origin: DOMRect): void;
  onOpenDetail(): void;
  onOpenComments(): void;
}): JSX.Element {
  const { row, coinYen, busy = false, canUndo } = props;
  const { task, entry, state } = row;

  // True for one STACK_MS after a completion tap so the block-drop keyframes
  // play. Removed on animationend — re-adding the same class restarts
  // nothing, so the class has to leave before a re-tap can replay it.
  const [stacking, setStacking] = useState(false);

  const decided = state === "pending" || state === "approved";
  const pill = STATE_PILL[state];

  const complete = (event: ReactMouseEvent<HTMLElement>) => {
    setStacking(true);
    props.onComplete(event.currentTarget.getBoundingClientRect());
  };

  return (
    <div
      className={[
        "card flex items-stretch gap-1 p-2",
        state === "late" ? "border-late/50 bg-late/10" : "",
        stacking ? "tsu-stack" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={stacking ? { animationDuration: `${STACK_MS}ms` } : undefined}
      onAnimationEnd={(event) => {
        if (event.animationName === "tsu-stack") setStacking(false);
      }}
    >
      {/* Reading and doing are different intentions and now different
          targets. This one only opens the detail sheet: a long chore name is
          clipped to two lines here, and tapping the row to finish reading it
          used to tick the chore off instead. */}
      <button
        type="button"
        aria-label={`${task.title} を くわしく みる`}
        onClick={() => props.onOpenDetail()}
        className={[
          "flex min-h-tap min-w-0 flex-1 items-center gap-3 rounded-card px-2 py-1 text-left",
          "transition-colors active:bg-sunk",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        ].join(" ")}
      >
        <span className="flex-none text-3xl" aria-hidden="true">
          {task.emoji}
        </span>

        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-base font-bold text-ink">
            {task.title}
          </span>
          {pill ? (
            <span
              className={`mt-0.5 inline-flex items-center whitespace-nowrap rounded-pill border px-2 py-0.5 text-xs font-bold ${
                {
                  neutral: "border-rule bg-sunk text-muted",
                  coin: "border-coin/40 bg-coin/15 text-ink",
                  done: "border-done/40 bg-done/15 text-done",
                  wait: "border-wait/40 bg-wait/15 text-wait",
                  late: "border-late/40 bg-late/15 text-late",
                  self: "border-self/40 bg-self/15 text-self",
                }[pill.tone]
              }`}
            >
              {pill.text}
            </span>
          ) : null}
          {row.dailyProgress ? (
            <span className="mt-0.5 ml-1 inline-flex items-center whitespace-nowrap rounded-pill border border-rule bg-sunk px-2 py-0.5 text-xs font-bold tabular-nums text-muted">
              {row.dailyProgress.done}/{row.dailyProgress.count}かい
            </span>
          ) : null}
        </span>

        <CoinAmount
          coins={task.coin}
          yen={coinYen > 0 ? task.coin * coinYen : undefined}
          size="sm"
          className="flex-none"
        />
      </button>

      {/* The only thing that completes a chore. */}
      <button
        type="button"
        disabled={busy || decided}
        aria-label={
          decided
            ? `${task.title} は もう できたよ`
            : `${task.title} を やったにする`
        }
        onClick={complete}
        className={[
          "grid h-11 w-11 flex-none place-items-center self-center rounded-pill border-2 text-xl font-bold",
          "transition-transform active:scale-95 disabled:active:scale-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
          state === "approved"
            ? "border-done bg-done text-paper"
            : state === "pending"
              ? "border-wait bg-wait/15 text-wait"
              : "border-rule-strong text-muted",
        ].join(" ")}
      >
        <span aria-hidden="true">
          {state === "approved" ? "✓" : state === "pending" ? "…" : ""}
        </span>
      </button>

      <span className="flex flex-none flex-col justify-center gap-1">
        {entry && canUndo ? (
          <IconButton
            label={`${task.title} を とりけす`}
            disabled={busy}
            onClick={(event) =>
              props.onUndo(event.currentTarget.getBoundingClientRect())
            }
          >
            ↩︎
          </IconButton>
        ) : null}
        {entry ? (
          <IconButton
            label={`${task.title} の コメントを みる`}
            disabled={busy}
            onClick={() => props.onOpenComments()}
          >
            💬
          </IconButton>
        ) : null}
      </span>
    </div>
  );
}
