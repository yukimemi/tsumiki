import { z } from "zod";
import type { Entry, FestivalDraw, FestivalSettings, Task } from "../types";
import { isTaskDueOn } from "./due";
import { festivalDrawId } from "./ids";

export const MIN_FESTIVAL_MULTIPLIER = 2;
export const MAX_FESTIVAL_MULTIPLIER = 5;

export const FESTIVAL_MULTIPLIERS = [2, 3, 4, 5] as const;

export const MAX_FESTIVAL_INTERVAL_DAYS = 30;
export const MAX_FESTIVAL_TASK_COUNT = 30;

export const DEFAULT_FESTIVAL_SETTINGS: FestivalSettings = {
  enabled: false,
  intervalDays: 3,
  taskCount: 1,
  multiplier: 2,
};

export function isValidFestivalMultiplier(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_FESTIVAL_MULTIPLIER &&
    value <= MAX_FESTIVAL_MULTIPLIER
  );
}

export function clampFestivalMultiplier(value: number): number {
  if (!Number.isFinite(value)) return MIN_FESTIVAL_MULTIPLIER;
  return Math.min(
    MAX_FESTIVAL_MULTIPLIER,
    Math.max(MIN_FESTIVAL_MULTIPLIER, Math.round(value)),
  );
}

export const festivalMultiplierSchema = z
  .number()
  .int("ばいりつは せいすうで いれてね")
  .min(
    MIN_FESTIVAL_MULTIPLIER,
    `ばいりつは ${MIN_FESTIVAL_MULTIPLIER}ばい いじょうに してね`,
  )
  .max(
    MAX_FESTIVAL_MULTIPLIER,
    `ばいりつは ${MAX_FESTIVAL_MULTIPLIER}ばい までに してね`,
  );

export const festivalSettingsSchema = z.object({
  enabled: z.boolean(),
  intervalDays: z
    .number()
    .int("にっすうは せいすうで いれてね")
    .min(1, "1にち いじょうに してね")
    .max(
      MAX_FESTIVAL_INTERVAL_DAYS,
      `${MAX_FESTIVAL_INTERVAL_DAYS}にち までに してね`,
    ),
  taskCount: z
    .number()
    .int("かずは せいすうで いれてね")
    .min(1, "1こ いじょうに してね")
    .max(
      MAX_FESTIVAL_TASK_COUNT,
      `${MAX_FESTIVAL_TASK_COUNT}こ までに してね`,
    ),
  multiplier: festivalMultiplierSchema,
  anchorDate: z
    .string()
    .refine(
      (value) => value === "" || z.iso.date().safeParse(value).success,
      "ほんとうに ある ひづけを いれてね",
    )
    .optional(),
});

export const manualFestivalSchema = z.object({
  dateKey: z
    .string()
    .refine(
      (value) => z.iso.date().safeParse(value).success,
      "ほんとうに ある ひづけを いれてね",
    ),
  multiplier: festivalMultiplierSchema,
});

/** Whole days since 1970-01-01 for a "YYYY-MM-DD" key, timezone-independent. */
export function epochDayOfKey(dateKey: string): number {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const day = Number(dateKey.slice(8, 10));
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Whether `dateKey` lands on the family's "every N days" random festival
 * cadence. When `anchorDate` is recorded on the settings, day 0 is
 * `anchorDate` itself so turning the feature on takes effect on that day and
 * repeats every `intervalDays` days thereafter.
 */
export function isFestivalDay(
  dateKey: string,
  settings: FestivalSettings | null | undefined,
): boolean {
  if (!settings || !settings.enabled) return false;
  if (!Number.isFinite(settings.intervalDays) || settings.intervalDays < 1) {
    return false;
  }
  const interval = Math.floor(settings.intervalDays);
  if (interval === 1) return true;
  const targetDay = epochDayOfKey(dateKey);
  if (settings.anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(settings.anchorDate)) {
    const diff = targetDay - epochDayOfKey(settings.anchorDate);
    return diff >= 0 && diff % interval === 0;
  }
  return ((targetDay % interval) + interval) % interval === 0;
}

/**
 * Parent-specified multiplier for `(task, dateKey)`, or `null` when none is set
 * or the stored number is outside `2..5`.
 */
export function manualMultiplierForTask(
  task: Pick<Task, "manualFestivals">,
  dateKey: string,
): number | null {
  const raw = task.manualFestivals?.[dateKey];
  return isValidFestivalMultiplier(raw) ? raw : null;
}

/**
 * Random-draw multiplier for `taskId` from a persisted `FestivalDraw`, or
 * `null` when the task was not picked in that draw.
 */
export function randomMultiplierForTask(
  taskId: string,
  draw: FestivalDraw | null | undefined,
): number | null {
  if (!draw) return null;
  const fromMap = draw.taskMultipliers?.[taskId];
  if (isValidFestivalMultiplier(fromMap)) return fromMap;
  if (draw.taskIds.includes(taskId) && isValidFestivalMultiplier(draw.multiplier)) {
    return draw.multiplier;
  }
  return null;
}

/**
 * Resolves the active multiplier for `(task, dateKey)`. Manual festival always
 * overrides the random draw for the same task and date.
 */
export function effectiveMultiplierForTask(
  task: Pick<Task, "id" | "manualFestivals">,
  dateKey: string,
  draw?: FestivalDraw | null,
): { multiplier: number; source: "manual" | "random" | null } {
  const manual = manualMultiplierForTask(task, dateKey);
  if (manual !== null) {
    return { multiplier: manual, source: "manual" };
  }
  const random = randomMultiplierForTask(task.id, draw);
  if (random !== null) {
    return { multiplier: random, source: "random" };
  }
  return { multiplier: 1, source: null };
}

/**
 * Coins awarded for a completion: `baseCoin * multiplier` when a valid
 * festival multiplier (2..5) is active, or `baseCoin` otherwise.
 */
export function effectiveReward(
  baseCoin: number,
  multiplier?: number | null,
): number {
  if (!isValidFestivalMultiplier(multiplier)) return baseCoin;
  return baseCoin * multiplier;
}

export function resolveTaskReward(
  task: Pick<Task, "id" | "coin" | "manualFestivals">,
  dateKey: string,
  draw?: FestivalDraw | null,
): {
  baseCoin: number;
  coin: number;
  multiplier: number;
  isFestival: boolean;
  source: "manual" | "random" | null;
} {
  const { multiplier, source } = effectiveMultiplierForTask(task, dateKey, draw);
  const coin = effectiveReward(task.coin, multiplier);
  return {
    baseCoin: task.coin,
    coin,
    multiplier,
    isFestival: multiplier >= MIN_FESTIVAL_MULTIPLIER,
    source,
  };
}

/**
 * Candidate tasks eligible for the random festival draw on `dateKey`.
 *
 * Excludes soft-deleted tasks, archived tasks, tasks not scheduled on
 * `dateKey`, and tasks that already carry a parent-specified manual festival
 * on `dateKey` (manual tasks do not count against K).
 */
export function festivalCandidatesForDate(
  tasks: readonly Task[],
  dateKey: string,
): Task[] {
  return tasks.filter(
    (task) =>
      !task.deletedAt &&
      !task.archived &&
      isTaskDueOn(task, dateKey) &&
      manualMultiplierForTask(task, dateKey) === null,
  );
}

/**
 * Produces the random festival draw for `dateKey` (or returns `existingDraw`
 * unchanged when one has already been fixed for that day).
 *
 * K is clamped to the number of candidate tasks scheduled for `dateKey`, and
 * M is clamped to the integer range 2..5.
 */
export function drawFestivalTasks(input: {
  householdId?: string;
  dateKey: string;
  tasks: readonly Task[];
  settings: FestivalSettings | null | undefined;
  existingDraw?: FestivalDraw | null;
  rng?: () => number;
}): FestivalDraw | null {
  if (input.existingDraw) return input.existingDraw;
  const { householdId = "household", dateKey, tasks, settings } = input;
  if (!isFestivalDay(dateKey, settings) || !settings) return null;

  const multiplier = clampFestivalMultiplier(settings.multiplier);
  const candidates = festivalCandidatesForDate(tasks, dateKey);
  const rawCount = Number.isFinite(settings.taskCount)
    ? Math.max(0, Math.floor(settings.taskCount))
    : 0;
  const count = Math.min(rawCount, candidates.length);

  const random = input.rng ?? Math.random;
  const pool = [...candidates];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }

  const chosen = pool.slice(0, count);
  const taskIds = chosen.map((task) => task.id);
  const taskMultipliers: Record<string, number> = {};
  for (const id of taskIds) {
    taskMultipliers[id] = multiplier;
  }

  return {
    id: festivalDrawId(householdId, dateKey),
    householdId,
    dateKey,
    taskIds,
    multiplier,
    taskMultipliers,
  };
}

/**
 * Extracts the multiplied coin amount, original base coin amount, and
 * multiplier from an `Entry` snapshot for display and approval.
 */
export function entryFestivalReward(
  entry: Pick<Entry, "coin" | "baseCoin" | "festivalMultiplier">,
): {
  coin: number;
  baseCoin?: number;
  festivalMultiplier?: number;
} {
  if (!isValidFestivalMultiplier(entry.festivalMultiplier)) {
    return { coin: entry.coin };
  }
  const baseCoin =
    entry.baseCoin ?? Math.round(entry.coin / entry.festivalMultiplier);
  return {
    coin: entry.coin,
    baseCoin,
    festivalMultiplier: entry.festivalMultiplier,
  };
}
