import { WEEKDAY_LABELS_JA } from "./date";
import type { MemberInfo, RepeatRule, Role, Task } from "../types";

/**
 * How a task describes itself in Japanese.
 *
 * Shared because two surfaces answer the same question — the parent's task
 * manager and the detail sheet a child opens from きょう — and a chore that
 * reads "まいしゅう 月・水" in one place and something else in the other is
 * just a bug waiting to be reported.
 */

type Member = { uid: string; role: Role; info: MemberInfo };

function ascending(a: number, b: number): number {
  return a - b;
}

export function repeatLabelJa(repeat: RepeatRule): string {
  switch (repeat.type) {
    case "once":
      return "1かいだけ";
    case "daily":
      return "まいにち";
    case "weekly": {
      const days = [...repeat.weekdays]
        .sort(ascending)
        .map((weekday) => WEEKDAY_LABELS_JA[weekday])
        .join("・");
      return days ? `まいしゅう ${days}` : "まいしゅう";
    }
    case "monthly": {
      const days = [...repeat.days]
        .sort(ascending)
        .map((day) => `${day}日`)
        .join("・");
      return days ? `まいつき ${days}` : "まいつき";
    }
  }
}

/** An empty assignee list means the chore belongs to the whole family. */
export function assigneeLabelJa(task: Task, members: Member[]): string {
  if (task.assigneeIds.length === 0) return "みんな";
  return task.assigneeIds
    .map(
      (uid) =>
        members.find((member) => member.uid === uid)?.info.displayName ??
        "だれか",
    )
    .join("・");
}
