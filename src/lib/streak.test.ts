import { describe, it, expect } from "vitest";
import { streakFor } from "./streak";

const TODAY = "2026-08-23";

describe("streakFor", () => {
  it("returns zeroes for no approved days", () => {
    expect(streakFor([], TODAY)).toEqual({ current: 0, best: 0, lastKey: null });
  });

  it("counts a single day done today", () => {
    expect(streakFor([TODAY], TODAY)).toEqual({
      current: 1,
      best: 1,
      lastKey: TODAY,
    });
  });

  it("counts consecutive days up to today", () => {
    const stat = streakFor(["2026-08-21", "2026-08-22", "2026-08-23"], TODAY);
    expect(stat.current).toBe(3);
    expect(stat.best).toBe(3);
    expect(stat.lastKey).toBe("2026-08-23");
  });

  it("keeps the streak alive when today is not done yet", () => {
    const stat = streakFor(["2026-08-21", "2026-08-22"], TODAY);
    expect(stat.current).toBe(2);
    expect(stat.lastKey).toBe("2026-08-22");
  });

  it("breaks the streak once a whole day was skipped", () => {
    // Nothing yesterday and nothing today.
    const stat = streakFor(["2026-08-20", "2026-08-21"], TODAY);
    expect(stat.current).toBe(0);
    expect(stat.best).toBe(2);
    expect(stat.lastKey).toBe("2026-08-21");
  });

  it("stops counting back across a gap", () => {
    const stat = streakFor(
      ["2026-08-18", "2026-08-19", "2026-08-22", "2026-08-23"],
      TODAY,
    );
    expect(stat.current).toBe(2);
    expect(stat.best).toBe(2);
  });

  it("reports a best longer than the current streak", () => {
    const stat = streakFor(
      [
        "2026-08-10",
        "2026-08-11",
        "2026-08-12",
        "2026-08-13",
        "2026-08-14",
        "2026-08-23",
      ],
      TODAY,
    );
    expect(stat.current).toBe(1);
    expect(stat.best).toBe(5);
    expect(stat.lastKey).toBe("2026-08-23");
  });

  it("collapses duplicate keys into one day", () => {
    const stat = streakFor(
      ["2026-08-23", "2026-08-23", "2026-08-22", "2026-08-22", "2026-08-22"],
      TODAY,
    );
    expect(stat.current).toBe(2);
    expect(stat.best).toBe(2);
  });

  it("accepts unsorted input", () => {
    const stat = streakFor(
      ["2026-08-23", "2026-08-21", "2026-08-22", "2026-08-19"],
      TODAY,
    );
    expect(stat.current).toBe(3);
    expect(stat.best).toBe(3);
    expect(stat.lastKey).toBe("2026-08-23");
  });

  it("counts a streak that runs across a month boundary", () => {
    const stat = streakFor(
      ["2026-07-30", "2026-07-31", "2026-08-01"],
      "2026-08-01",
    );
    expect(stat.current).toBe(3);
    expect(stat.best).toBe(3);
  });

  it("accepts a Set as input", () => {
    const stat = streakFor(new Set(["2026-08-22", "2026-08-23"]), TODAY);
    expect(stat.current).toBe(2);
  });
});
