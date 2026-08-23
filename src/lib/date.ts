/**
 * Date keys. Every stored date in tsumiki is a "YYYY-MM-DD" string in
 * Asia/Tokyo, never a Date and never a UTC day.
 *
 * "What day is it?" is answered by asking Intl for Tokyo's calendar fields.
 * Adding nine hours to a local Date is wrong for anyone whose machine is not
 * in Tokyo and hides the error on the developer's own laptop.
 *
 * Calendar arithmetic (add a day, walk a week, build a month grid) happens on
 * Dates parsed at *local* midnight instead. Those Dates only ever carry
 * calendar fields, so `dateKeyOf(parseDateKey(k)) === k` in every timezone,
 * and `date-fns` can be used directly on them.
 */

import { addDays, format } from "date-fns";

export const TOKYO = "Asia/Tokyo";

export const WEEKDAY_LABELS_JA: readonly string[] = [
  "日",
  "月",
  "火",
  "水",
  "木",
  "金",
  "土",
];

const tokyoDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TOKYO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const tokyoTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TOKYO,
  hour: "2-digit",
  minute: "2-digit",
  // h23 keeps midnight as "00", which h24/hour12 renderings do not.
  hourCycle: "h23",
});

/** Reads named fields instead of trusting the formatter's string layout. */
function partsOf(
  formatter: Intl.DateTimeFormat,
  at: Date,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== "literal") fields[part.type] = part.value;
  }
  return fields;
}

/** Today in Tokyo, regardless of where the device thinks it is. */
export function todayKey(now?: Date): string {
  const p = partsOf(tokyoDateFormat, now ?? new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

/** The Date's own calendar day. Pair of `parseDateKey`, not a Tokyo shift. */
export function dateKeyOf(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Local midnight, so `date-fns` formatting shows the intended calendar day. */
export function parseDateKey(key: string): Date {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  return new Date(year, month - 1, day);
}

export function addDaysKey(key: string, days: number): string {
  return dateKeyOf(addDays(parseDateKey(key), days));
}

/** 0 = Sunday .. 6 = Saturday. */
export function weekdayOfKey(key: string): number {
  return parseDateKey(key).getDay();
}

export function dayOfMonthKey(key: string): number {
  return Number(key.slice(8, 10));
}

export function monthKeyOf(key: string): string {
  return key.slice(0, 7);
}

/** "8月23日(日)" */
export function formatDateJa(key: string): string {
  const date = parseDateKey(key);
  return `${format(date, "M月d日")}(${WEEKDAY_LABELS_JA[date.getDay()]})`;
}

/** "2026年8月" */
export function formatMonthJa(monthKey: string): string {
  return `${monthKey.slice(0, 4)}年${Number(monthKey.slice(5, 7))}月`;
}

/** "HH:mm" in Tokyo. Compared as a string against `Task.dueTime`. */
export function nowHm(now?: Date): string {
  const p = partsOf(tokyoTimeFormat, now ?? new Date());
  return `${p.hour}:${p.minute}`;
}

/** Monday..Sunday of the ISO week containing `anchorKey`. Always 7 keys. */
export function weekKeys(anchorKey: string): string[] {
  const weekday = weekdayOfKey(anchorKey);
  const monday = addDays(parseDateKey(anchorKey), weekday === 0 ? -6 : 1 - weekday);
  return Array.from({ length: 7 }, (_, i) => dateKeyOf(addDays(monday, i)));
}

/**
 * Six rows of seven keys, Sunday-first, padded with the neighbouring months.
 * Always six rows: a five-row February must not make the calendar jump when
 * the user swipes to the next month.
 */
export function monthGrid(monthKey: string): string[][] {
  const first = parseDateKey(`${monthKey}-01`);
  const start = addDays(first, -first.getDay());
  const rows: string[][] = [];
  for (let row = 0; row < 6; row++) {
    rows.push(
      Array.from({ length: 7 }, (_, col) =>
        dateKeyOf(addDays(start, row * 7 + col)),
      ),
    );
  }
  return rows;
}
