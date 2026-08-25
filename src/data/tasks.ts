// Task definitions. Deletion is soft: entries snapshot their task's title and
// reward, but the timeline still links back by `taskId`, and a hard delete would
// leave those links dangling. Archiving is the everyday case — a chore that is
// out of season, not gone.
//
// Both flags are filtered client-side. Firestore cannot combine them with the
// `order` sort without a composite index per combination, and a household has
// tens of tasks, not thousands.

import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { useMemo } from "react";
import { db } from "../lib/firebase";
import type { Live, Task } from "../types";
import { useLiveDocs } from "./live";
import { forMerge, forWrite } from "./sanitise";

const COL = "tasks";

export type TaskDraft = Omit<
  Task,
  | "id"
  | "householdId"
  | "createdBy"
  | "createdAt"
  | "updatedAt"
  | "deletedAt"
  | "order"
  | "archived"
> & { order?: number };

function mapTask(d: QueryDocumentSnapshot<DocumentData>): Task {
  return { ...(d.data() as Omit<Task, "id">), id: d.id };
}

/** Manual order wins; creation time breaks ties so a list never jitters. */
function byOrder(a: Task, b: Task): number {
  if (a.order !== b.order) return a.order - b.order;
  return (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0);
}

/** Everything a parent manages, archived included. Soft-deleted rows are gone. */
export function useAllTasks(householdId: string | null): Live<Task[]> {
  const live = useLiveDocs<Task>(
    householdId
      ? () => query(collection(db(), COL), where("householdId", "==", householdId))
      : null,
    mapTask,
    [householdId],
  );
  return useMemo(
    () => ({
      data: live.data.filter((t) => !t.deletedAt).sort(byOrder),
      loading: live.loading,
      error: live.error,
    }),
    [live],
  );
}

/** What the daily screens work from. */
export function useTasks(householdId: string | null): Live<Task[]> {
  const live = useAllTasks(householdId);
  return useMemo(
    () => ({
      data: live.data.filter((t) => !t.archived),
      loading: live.loading,
      error: live.error,
    }),
    [live],
  );
}

/**
 * Reading every task to find the highest `order` costs one query and no index;
 * `orderBy("order","desc").limit(1)` alongside the household filter would need
 * a composite one for a list this small.
 */
async function nextOrder(householdId: string): Promise<number> {
  const snap = await getDocs(
    query(collection(db(), COL), where("householdId", "==", householdId)),
  );
  let highest = -1;
  for (const d of snap.docs) {
    const order = d.get("order");
    if (typeof order === "number" && order > highest) highest = order;
  }
  return highest + 1;
}

export async function createTask(
  householdId: string,
  actorUid: string,
  draft: TaskDraft,
): Promise<string> {
  const order = draft.order ?? (await nextOrder(householdId));
  const ref = await addDoc(
    collection(db(), COL),
    forWrite({
      ...draft,
      order,
      householdId,
      createdBy: actorUid,
      archived: false,
      deletedAt: null,
    }),
  );
  return ref.id;
}

/**
 * `null` on an optional field means "stop setting this". `clean` drops
 * `undefined` and `""` as absences, so without an explicit sentinel a parent
 * who set a due time could never take it off again.
 */
export type TaskPatch = Partial<
  Omit<TaskDraft, "dueTime" | "note" | "category">
> & {
  dueTime?: string | null;
  note?: string | null;
  category?: string | null;
};

export async function updateTask(id: string, patch: TaskPatch): Promise<void> {
  const { dueTime, note, category, ...rest } = patch;
  const payload: Record<string, unknown> = forMerge(rest);
  if (dueTime !== undefined) {
    payload.dueTime = dueTime === null || dueTime === "" ? deleteField() : dueTime;
  }
  if (note !== undefined) {
    payload.note = note === null || note === "" ? deleteField() : note;
  }
  // Same sentinel story as the two above: emptying the field is how a parent
  // takes a task back out of a group, and `clean` would read "" as absence.
  if (category !== undefined) {
    payload.category =
      category === null || category === "" ? deleteField() : category;
  }
  await updateDoc(doc(db(), COL, id), payload);
}

export async function setTaskArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  await updateDoc(doc(db(), COL, id), forMerge({ archived }));
}

export async function softDeleteTask(id: string): Promise<void> {
  await updateDoc(doc(db(), COL, id), {
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** `ids` in their new order; positions are rewritten from scratch. */
export async function reorderTasks(ids: string[]): Promise<void> {
  const firestore = db();
  const batch = writeBatch(firestore);
  for (let i = 0; i < ids.length; i += 1) {
    batch.update(doc(firestore, COL, ids[i]), {
      order: i,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}
