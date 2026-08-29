import { describe, it, expect } from "vitest";
import {
  WEEKDAY_LABELS_JA,
  addDaysKey,
  dateKeyOf,
  dayOfMonthKey,
  formatDateJa,
  formatMonthJa,
  lastDayOfMonthKey,
  monthGrid,
  monthKeyOf,
  nowHm,
  parseDateKey,
  todayKey,
  weekKeyOf,
  weekKeys,
  weekdayOfKey,
} from "./date";

describe("todayKey / nowHm", () => {
  it("uses the Tokyo calendar day, not UTC", () => {
    // 2026-08-22 15:30Z is already 2026-08-23 00:30 in Tokyo.
    expect(todayKey(new Date("2026-08-22T15:30:00Z"))).toBe("2026-08-23");
    // One hour earlier it is still 2026-08-22 23:30 in Tokyo.
    expect(todayKey(new Date("2026-08-22T14:30:00Z"))).toBe("2026-08-22");
  });

  it("reports Tokyo wall-clock time and keeps midnight as 00", () => {
    expect(nowHm(new Date("2026-08-22T15:30:00Z"))).toBe("00:30");
    expect(nowHm(new Date("2026-08-22T14:30:00Z"))).toBe("23:30");
    expect(nowHm(new Date("2026-08-22T15:00:00Z"))).toBe("00:00");
  });
});

describe("parseDateKey / dateKeyOf", () => {
  it("round-trips a key through a Date", () => {
    expect(dateKeyOf(parseDateKey("2026-08-23"))).toBe("2026-08-23");
    expect(dateKeyOf(parseDateKey("2026-01-01"))).toBe("2026-01-01");
  });

  it("parses to the intended calendar day", () => {
    const date = parseDateKey("2026-08-23");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(23);
    expect(date.getHours()).toBe(0);
  });
});

describe("addDaysKey", () => {
  it("crosses a month boundary", () => {
    expect(addDaysKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysKey("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("crosses a year boundary", () => {
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("handles a leap day and multi-day jumps", () => {
    expect(addDaysKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysKey("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysKey("2026-08-23", 7)).toBe("2026-08-30");
    expect(addDaysKey("2026-08-23", 0)).toBe("2026-08-23");
  });
});

describe("weekdayOfKey / dayOfMonthKey / monthKeyOf", () => {
  it("reads the calendar fields of a key", () => {
    expect(weekdayOfKey("2026-08-23")).toBe(0); // Sunday
    expect(weekdayOfKey("2026-08-22")).toBe(6); // Saturday
    expect(weekdayOfKey("2026-08-17")).toBe(1); // Monday
    expect(dayOfMonthKey("2026-08-01")).toBe(1);
    expect(dayOfMonthKey("2026-08-31")).toBe(31);
    expect(monthKeyOf("2026-08-23")).toBe("2026-08");
  });
});

describe("weekKeys", () => {
  it("starts on Monday even when the anchor is a Sunday", () => {
    const keys = weekKeys("2026-08-23"); // a Sunday
    expect(keys).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
    expect(weekdayOfKey(keys[0])).toBe(1);
    expect(weekdayOfKey(keys[6])).toBe(0);
  });

  it("returns the same week for every day inside it", () => {
    const fromMonday = weekKeys("2026-08-17");
    for (const key of fromMonday) {
      expect(weekKeys(key)).toEqual(fromMonday);
    }
  });
});

describe("weekKeyOf", () => {
  it("returns the same Monday for every day inside the week", () => {
    for (const key of weekKeys("2026-08-17")) {
      expect(weekKeyOf(key)).toBe("2026-08-17");
    }
  });

  it("returns a different key for the week before and after", () => {
    expect(weekKeyOf("2026-08-16")).toBe("2026-08-10"); // Sunday, prior week
    expect(weekKeyOf("2026-08-24")).toBe("2026-08-24"); // Monday, next week
  });
});

describe("monthGrid", () => {
  it("is always six rows of seven Sunday-first days", () => {
    for (const monthKey of ["2026-02", "2026-08", "2026-11", "2027-01"]) {
      const grid = monthGrid(monthKey);
      expect(grid).toHaveLength(6);
      for (const row of grid) {
        expect(row).toHaveLength(7);
        expect(weekdayOfKey(row[0])).toBe(0);
        expect(weekdayOfKey(row[6])).toBe(6);
      }
    }
  });

  it("starts on the first when the month starts on a Sunday", () => {
    const grid = monthGrid("2026-02"); // 2026-02-01 is a Sunday
    expect(grid[0][0]).toBe("2026-02-01");
    // Padded into March so the grid keeps six rows.
    expect(grid[5][6]).toBe("2026-03-14");
  });

  it("pads with the previous month when the month starts on a Saturday", () => {
    const grid = monthGrid("2026-08"); // 2026-08-01 is a Saturday
    expect(grid[0][0]).toBe("2026-07-26");
    expect(grid[0][6]).toBe("2026-08-01");
    expect(grid[5][6]).toBe("2026-09-05");
  });

  it("covers every day of the month exactly once", () => {
    const days = monthGrid("2026-02").flat().filter((k) => monthKeyOf(k) === "2026-02");
    expect(days).toHaveLength(28);
    expect(new Set(days).size).toBe(28);
  });
});

describe("Japanese formatting", () => {
  it("formats a date with its weekday and no zero padding", () => {
    expect(formatDateJa("2026-08-23")).toBe("8月23日(日)");
    expect(formatDateJa("2026-08-01")).toBe("8月1日(土)");
    expect(formatDateJa("2026-01-05")).toBe("1月5日(月)");
  });

  it("formats a month key", () => {
    expect(formatMonthJa("2026-08")).toBe("2026年8月");
    expect(formatMonthJa("2026-12")).toBe("2026年12月");
  });

  it("labels weekdays in getDay order", () => {
    expect(WEEKDAY_LABELS_JA).toHaveLength(7);
    expect(WEEKDAY_LABELS_JA[0]).toBe("日");
    expect(WEEKDAY_LABELS_JA[6]).toBe("土");
    expect(WEEKDAY_LABELS_JA[weekdayOfKey("2026-08-17")]).toBe("月");
  });
});

describe("lastDayOfMonthKey", () => {
  it("stays inside February on a leap year", () => {
    expect(lastDayOfMonthKey("2024-02")).toBe("2024-02-29");
  });

  it("stays inside February on a non-leap year, never overflowing into March", () => {
    expect(lastDayOfMonthKey("2026-02")).toBe("2026-02-28");
  });

  it("returns the 31st for a 31-day month", () => {
    expect(lastDayOfMonthKey("2026-08")).toBe("2026-08-31");
  });

  it("returns the 30th for a 30-day month", () => {
    expect(lastDayOfMonthKey("2026-04")).toBe("2026-04-30");
  });
});
