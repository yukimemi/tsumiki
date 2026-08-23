/** Whether a task shows up on a given day, and whether it is late. */

import type { Task } from "../types";
import { dayOfMonthKey, weekdayOfKey } from "./date";

/**
 * `once` tasks are due on every date: they have no schedule, they just have to
 * happen eventually. The caller drops them once an entry exists, which is the
 * only place that knows about entries.
 */
export function isTaskDueOn(task: Task, dateKey: string): boolean {
  switch (task.repeat.type) {
    case "once":
    case "daily":
      return true;
    case "weekly":
      return task.repeat.weekdays.includes(weekdayOfKey(dateKey));
    case "monthly":
      return task.repeat.days.includes(dayOfMonthKey(dateKey));
    default:
      // A repeat type written by a newer client: show nothing rather than
      // nagging the child about a rule this build cannot evaluate.
      return false;
  }
}

/**
 * Past days are always late. Today is late only after `dueTime` has passed;
 * exactly at `dueTime` there is still time to do it.
 */
export function isOverdue(
  task: Task,
  dateKey: string,
  todayKeyValue: string,
  nowHmValue: string,
): boolean {
  if (dateKey < todayKeyValue) return true;
  if (dateKey !== todayKeyValue) return false;
  if (!task.dueTime) return false;
  return nowHmValue > task.dueTime;
}
