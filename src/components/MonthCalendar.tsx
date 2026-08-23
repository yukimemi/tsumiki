import { formatMonthJa, dayOfMonthKey, WEEKDAY_LABELS_JA } from "../lib/date";
import type { JSX } from "react";
import type { DayCell } from "../screens/records";
import { IconButton } from "./ui";

/**
 * The month view on the records screen. Geometry is a 7-column grid; meaning
 * is slots: `done` for the completion blocks, `self` for today and the
 * selection, and nothing else — a Saturday is just a day, never `late`.
 *
 * Intensity is `color-mix` against `--done` so swapping the slot repaints
 * every block at once.
 */
export function MonthCalendar(props: {
  monthKey: string;
  cells: DayCell[][];
  selectedKey: string | null;
  todayKey: string;
  onSelect(dateKey: string): void;
  onMonth(delta: number): void;
}): JSX.Element {
  const flat = props.cells.flat();
  const maxCoins = flat.reduce((max, cell) => Math.max(max, cell.coins), 0);

  return (
    <section aria-label={formatMonthJa(props.monthKey)}>
      <div className="flex items-center gap-1">
        <IconButton label="まえのつき" onClick={() => props.onMonth(-1)}>
          ‹
        </IconButton>
        <h2 className="flex-1 text-center text-base font-bold text-ink">
          {formatMonthJa(props.monthKey)}
        </h2>
        <IconButton label="つぎのつき" onClick={() => props.onMonth(1)}>
          ›
        </IconButton>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS_JA.map((label) => (
          <span
            key={label}
            className="pb-1 text-center text-xs font-bold text-muted"
            aria-hidden="true"
          >
            {label}
          </span>
        ))}

        {flat.map((cell) => {
          const selected = cell.dateKey === props.selectedKey;
          const today = cell.dateKey === props.todayKey;
          // 0 coins still renders the day's number; colour starts at one.
          const strength =
            maxCoins > 0 ? Math.round(20 + (60 * cell.coins) / maxCoins) : 0;
          const shown = Math.min(cell.count, 3);

          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => props.onSelect(cell.dateKey)}
              aria-pressed={selected}
              aria-label={`${cell.dateKey}、${cell.count}件`}
              className={[
                "flex min-h-tap flex-col items-center justify-start gap-0.5 rounded-card border px-0.5 py-1 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self",
                selected
                  ? "border-self bg-self text-paper"
                  : "border-transparent text-ink active:bg-sunk",
                !selected && today ? "ring-2 ring-self" : "",
                cell.inMonth ? "" : "opacity-40",
              ].join(" ")}
            >
              <span className="text-sm font-bold tabular-nums">
                {dayOfMonthKey(cell.dateKey)}
              </span>
              {cell.count > 0 ? (
                <span className="flex items-center gap-0.5" aria-hidden="true">
                  {Array.from({ length: shown }, (_, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-pill"
                      style={{
                        background: selected
                          ? "var(--paper)"
                          : `color-mix(in srgb, var(--done) ${strength}%, var(--sunk))`,
                      }}
                    />
                  ))}
                  {cell.count > 3 ? (
                    <span
                      className={`text-[10px] font-bold leading-none ${
                        selected ? "text-paper" : "text-done"
                      }`}
                    >
                      +{cell.count - 3}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
