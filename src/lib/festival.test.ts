import { describe, expect, it } from "vitest";
import type { FestivalDraw, FestivalSettings, RepeatRule, Task } from "../types";
import {
  clampFestivalMultiplier,
  drawFestivalTasks,
  effectiveMultiplierForTask,
  effectiveReward,
  entryFestivalReward,
  festivalCandidatesForDate,
  festivalMultiplierSchema,
  festivalSettingsSchema,
  isFestivalDay,
  isValidFestivalMultiplier,
  manualFestivalSchema,
  resolveTaskReward,
} from "./festival";

function makeTask(overrides: Partial<Task> & { repeat?: RepeatRule } = {}): Task {
  return {
    id: "t1",
    householdId: "h1",
    title: "おふろそうじ",
    emoji: "🛁",
    coin: 10,
    needsApproval: false,
    assigneeIds: [],
    repeat: { type: "daily" },
    order: 0,
    archived: false,
    createdBy: "u1",
    ...overrides,
  };
}

const DATE = "2026-08-23"; // Sunday

describe("festival multiplier validation and range (2..5)", () => {
  it("accepts integers 2..5 and rejects out-of-range or non-integer values", () => {
    for (const m of [2, 3, 4, 5]) {
      expect(isValidFestivalMultiplier(m)).toBe(true);
      expect(festivalMultiplierSchema.safeParse(m).success).toBe(true);
    }
    for (const bad of [-1, 0, 1, 1.5, 2.5, 6, 10, NaN, Infinity]) {
      expect(isValidFestivalMultiplier(bad)).toBe(false);
      expect(festivalMultiplierSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("clamps multiplier values into the integer range 2..5", () => {
    expect(clampFestivalMultiplier(0)).toBe(2);
    expect(clampFestivalMultiplier(1)).toBe(2);
    expect(clampFestivalMultiplier(2)).toBe(2);
    expect(clampFestivalMultiplier(3.4)).toBe(3);
    expect(clampFestivalMultiplier(5)).toBe(5);
    expect(clampFestivalMultiplier(9)).toBe(5);
    expect(clampFestivalMultiplier(NaN)).toBe(2);
  });

  it("validates festival settings and manual festival schemas", () => {
    expect(
      festivalSettingsSchema.safeParse({
        enabled: true,
        intervalDays: 3,
        taskCount: 2,
        multiplier: 4,
        anchorDate: DATE,
      }).success,
    ).toBe(true);

    expect(
      festivalSettingsSchema.safeParse({
        enabled: true,
        intervalDays: 3,
        taskCount: 2,
        multiplier: 6,
      }).success,
    ).toBe(false);

    expect(
      manualFestivalSchema.safeParse({
        dateKey: DATE,
        multiplier: 3,
      }).success,
    ).toBe(true);

    expect(
      manualFestivalSchema.safeParse({
        dateKey: DATE,
        multiplier: 1,
      }).success,
    ).toBe(false);
  });
});

describe("isFestivalDay", () => {
  it("is false when disabled", () => {
    expect(
      isFestivalDay(DATE, {
        enabled: false,
        intervalDays: 1,
        taskCount: 1,
        multiplier: 2,
      }),
    ).toBe(false);
  });

  it("fires every N days from anchorDate when enabled", () => {
    const settings: FestivalSettings = {
      enabled: true,
      intervalDays: 3,
      taskCount: 1,
      multiplier: 3,
      anchorDate: "2026-08-20",
    };
    expect(isFestivalDay("2026-08-20", settings)).toBe(true);
    expect(isFestivalDay("2026-08-21", settings)).toBe(false);
    expect(isFestivalDay("2026-08-22", settings)).toBe(false);
    expect(isFestivalDay("2026-08-23", settings)).toBe(true);
    expect(isFestivalDay("2026-08-24", settings)).toBe(false);
    expect(isFestivalDay("2026-08-26", settings)).toBe(true);
  });
});

describe("drawFestivalTasks", () => {
  const settings: FestivalSettings = {
    enabled: true,
    intervalDays: 1,
    taskCount: 2,
    multiplier: 3,
    anchorDate: DATE,
  };

  it("keeps the draw fixed once made and never re-rolls when existingDraw is present", () => {
    const tasks = [
      makeTask({ id: "t1" }),
      makeTask({ id: "t2" }),
      makeTask({ id: "t3" }),
    ];
    const first = drawFestivalTasks({
      householdId: "h1",
      dateKey: DATE,
      tasks,
      settings,
      rng: () => 0.1,
    });
    expect(first).not.toBeNull();
    expect(first!.taskIds).toHaveLength(2);

    // Calling again with existingDraw and a different RNG or modified task list
    // returns the exact persisted draw without re-rolling.
    const second = drawFestivalTasks({
      householdId: "h1",
      dateKey: DATE,
      tasks: [makeTask({ id: "t3" })],
      settings: { ...settings, multiplier: 5, taskCount: 1 },
      existingDraw: first,
      rng: () => 0.99,
    });
    expect(second).toBe(first);
    expect(second!.taskIds).toEqual(first!.taskIds);
    expect(second!.multiplier).toBe(3);
  });

  it("clamps K to the number of available scheduled tasks for that day", () => {
    // 2026-08-23 is Sunday (0). t3 is Monday-only, t4 is archived.
    const tasks = [
      makeTask({ id: "t1", repeat: { type: "daily" } }),
      makeTask({ id: "t2", repeat: { type: "weekly", weekdays: [0] } }),
      makeTask({ id: "t3", repeat: { type: "weekly", weekdays: [1] } }),
      makeTask({ id: "t4", archived: true }),
    ];
    const candidates = festivalCandidatesForDate(tasks, DATE);
    expect(candidates.map((t) => t.id)).toEqual(["t1", "t2"]);

    const draw = drawFestivalTasks({
      householdId: "h1",
      dateKey: DATE,
      tasks,
      settings: { ...settings, taskCount: 5, multiplier: 4 },
    });
    expect(draw).not.toBeNull();
    expect(draw!.taskIds).toHaveLength(2);
    expect(new Set(draw!.taskIds)).toEqual(new Set(["t1", "t2"]));
    expect(draw!.multiplier).toBe(4);
    expect(draw!.taskMultipliers).toEqual({ t1: 4, t2: 4 });
  });

  it("clamps M to 2..5 when drawing", () => {
    const tasks = [makeTask({ id: "t1" })];
    const low = drawFestivalTasks({
      householdId: "h1",
      dateKey: DATE,
      tasks,
      settings: { ...settings, multiplier: 1 },
    });
    expect(low!.multiplier).toBe(2);
    expect(low!.taskMultipliers.t1).toBe(2);

    const high = drawFestivalTasks({
      householdId: "h1",
      dateKey: DATE,
      tasks,
      settings: { ...settings, multiplier: 9 },
    });
    expect(high!.multiplier).toBe(5);
    expect(high!.taskMultipliers.t1).toBe(5);
  });

  it("excludes manually specified festival tasks from counting against K", () => {
    const tasks = [
      makeTask({ id: "t1", manualFestivals: { [DATE]: 5 } }),
      makeTask({ id: "t2" }),
      makeTask({ id: "t3" }),
    ];
    const draw = drawFestivalTasks({
      householdId: "h1",
      dateKey: DATE,
      tasks,
      settings: { ...settings, taskCount: 2, multiplier: 3 },
    });
    expect(draw).not.toBeNull();
    // t1 is manual, so the 2 random slots pick t2 and t3.
    expect(new Set(draw!.taskIds)).toEqual(new Set(["t2", "t3"]));
  });
});

describe("effective reward calculation and manual-overrides-random priority", () => {
  const randomDraw: FestivalDraw = {
    id: `h1__${DATE}`,
    householdId: "h1",
    dateKey: DATE,
    taskIds: ["t1", "t2"],
    multiplier: 3,
    taskMultipliers: { t1: 3, t2: 3 },
  };

  it("multiplies base reward by active multiplier", () => {
    expect(effectiveReward(10, 1)).toBe(10);
    expect(effectiveReward(10, 2)).toBe(20);
    expect(effectiveReward(10, 3)).toBe(30);
    expect(effectiveReward(10, 5)).toBe(50);
  });

  it("gives manual festival priority over random draw for the same task and date", () => {
    const manualAndRandom = makeTask({
      id: "t1",
      coin: 10,
      manualFestivals: { [DATE]: 5 },
    });
    const randomOnly = makeTask({ id: "t2", coin: 10 });
    const normal = makeTask({ id: "t3", coin: 10 });

    const r1 = resolveTaskReward(manualAndRandom, DATE, randomDraw);
    expect(r1).toEqual({
      baseCoin: 10,
      coin: 50,
      multiplier: 5,
      isFestival: true,
      source: "manual",
    });

    const r2 = resolveTaskReward(randomOnly, DATE, randomDraw);
    expect(r2).toEqual({
      baseCoin: 10,
      coin: 30,
      multiplier: 3,
      isFestival: true,
      source: "random",
    });

    const r3 = resolveTaskReward(normal, DATE, randomDraw);
    expect(r3).toEqual({
      baseCoin: 10,
      coin: 10,
      multiplier: 1,
      isFestival: false,
      source: null,
    });
  });

  it("does not apply a manual festival set for a different date", () => {
    const otherDateManual = makeTask({
      id: "t3",
      coin: 10,
      manualFestivals: { "2026-08-24": 4 },
    });
    expect(effectiveMultiplierForTask(otherDateManual, DATE, randomDraw)).toEqual({
      multiplier: 1,
      source: null,
    });
  });

  it("extracts base and multiplied coins from an entry snapshot", () => {
    expect(
      entryFestivalReward({ coin: 30, baseCoin: 10, festivalMultiplier: 3 }),
    ).toEqual({
      coin: 30,
      baseCoin: 10,
      festivalMultiplier: 3,
    });
    expect(entryFestivalReward({ coin: 10 })).toEqual({ coin: 10 });
  });
});
