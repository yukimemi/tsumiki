import { addDaysKey, formatDateJa, todayKey } from "./date";
import type { Entry } from "../types";

/**
 * How long ago a completion happened, in the words a child uses.
 *
 * Lives outside the card that renders it so the card stays a component-only
 * module (React Fast Refresh gives up on a file that also exports helpers).
 */
export function formatWhenJa(entry: Entry, now: Date = new Date()): string {
  const ms = now.getTime() - entry.completedAt.toMillis();
  if (ms < 60_000) return "さっき";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}分まえ`;

  const today = todayKey(now);
  if (entry.dateKey === today) {
    // At least an hour, but still today: hours read better than "13時まえ".
    return `${Math.max(1, Math.floor(ms / 3_600_000))}時間まえ`;
  }
  if (entry.dateKey === addDaysKey(today, -1)) return "きのう";
  return formatDateJa(entry.dateKey);
}
