// An entry is one completion: this person, this task, this day. The document id
// encodes exactly that triple, so a double tap — or a second device, or a retry
// after a flaky network — writes the same document twice instead of paying twice.
// That is the whole reason `setDoc` is used here and `addDoc` is not.
//
// Titles and coin values are snapshotted onto the entry. Renaming a task or
// changing its reward must not rewrite history: the timeline has to keep showing
// what was actually done for what.

import {
  collection,
  doc,
  limit,
  orderBy,
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
import { entryId } from "../lib/ids";
import type { Entry, EntryStatus, Live, Task } from "../types";
import { applyCoinMovement } from "./coins";
import { coinDeltaForUndo, statusForTask } from "./entryRules";
import { useLiveDocs } from "./live";
import { deleteEntryPhoto, uploadEntryPhoto } from "./photos";
import { clean } from "./sanitise";

export { coinDeltaForUndo, statusForTask };

const COL = "entries";

const DEFAULT_RECENT_LIMIT = 60;

/** Shown on the ledger row when a completion is taken back. */
const UNDO_NOTE = "やりなおし";

function mapEntry(d: QueryDocumentSnapshot<DocumentData>): Entry {
  return { ...(d.data() as Omit<Entry, "id">), id: d.id };
}

/**
 * Which document a completion tap should write to today, given every entry
 * this member already has for this task on this day (any status, oldest
 * first). `null` means the day's quota is spent and there is nothing left to
 * write — the caller should treat the tap as a no-op.
 *
 * A trailing rejected entry is always redone in place (same slot, same id):
 * that is "try again", not "one more of the day's allowance". Otherwise a
 * new slot opens as long as fewer than `dailyLimit` entries are still live
 * (approved or pending) today.
 */
export function targetEntrySlot(
  todayEntries: Entry[],
  dailyLimit: number,
): { seq: number; redo: boolean } | null {
  const last = todayEntries.at(-1) ?? null;
  if (last && last.status === "rejected") {
    return { seq: todayEntries.length, redo: true };
  }
  const live = todayEntries.filter((e) => e.status !== "rejected").length;
  if (live >= dailyLimit) return null;
  return { seq: todayEntries.length + 1, redo: false };
}

/** The id a completion tap would write to right now, or `null` if the day's
 * quota is already spent. Used to key an uploaded photo to the slot it will
 * land on before the entry itself is written. */
export function nextEntryId(
  task: Pick<Task, "id" | "dailyLimit">,
  memberId: string,
  dateKey: string,
  todayEntries: Entry[],
): string | null {
  const slot = targetEntrySlot(todayEntries, task.dailyLimit ?? 1);
  return slot ? entryId(task.id, memberId, dateKey, slot.seq) : null;
}

export function buildEntry(
  task: Task,
  memberId: string,
  dateKey: string,
  seq: number,
): Omit<Entry, "completedAt"> & { completedAt: unknown } {
  return {
    id: entryId(task.id, memberId, dateKey, seq),
    householdId: task.householdId,
    taskId: task.id,
    taskTitle: task.title,
    taskEmoji: task.emoji,
    memberId,
    dateKey,
    status: statusForTask(task),
    coin: task.coin,
    completedAt: serverTimestamp(),
    commentCount: 0,
  };
}

export function useEntriesForDate(
  householdId: string | null,
  dateKey: string,
): Live<Entry[]> {
  return useLiveDocs<Entry>(
    householdId
      ? () =>
          query(
            collection(db(), COL),
            where("householdId", "==", householdId),
            where("dateKey", "==", dateKey),
          )
      : null,
    mapEntry,
    [householdId, dateKey],
  );
}

export function useRecentEntries(
  householdId: string | null,
  max = DEFAULT_RECENT_LIMIT,
): Live<Entry[]> {
  return useLiveDocs<Entry>(
    householdId
      ? () =>
          query(
            collection(db(), COL),
            where("householdId", "==", householdId),
            orderBy("completedAt", "desc"),
            limit(max),
          )
      : null,
    mapEntry,
    [householdId, max],
  );
}

export function useEntriesInRange(
  householdId: string | null,
  fromKey: string,
  toKey: string,
): Live<Entry[]> {
  return useLiveDocs<Entry>(
    householdId
      ? () =>
          query(
            collection(db(), COL),
            where("householdId", "==", householdId),
            where("dateKey", ">=", fromKey),
            where("dateKey", "<=", toKey),
          )
      : null,
    mapEntry,
    [householdId, fromKey, toKey],
  );
}

/**
 * The approval queue, oldest first — a child who has been waiting longest gets
 * looked at first. Sorted here rather than in the query so the two equality
 * filters need no composite index.
 */
export function usePendingEntries(householdId: string | null): Live<Entry[]> {
  const live = useLiveDocs<Entry>(
    householdId
      ? () =>
          query(
            collection(db(), COL),
            where("householdId", "==", householdId),
            where("status", "==", "pending"),
          )
      : null,
    mapEntry,
    [householdId],
  );
  return useMemo(
    () => ({
      data: [...live.data].sort(
        (a, b) => a.completedAt.toMillis() - b.completedAt.toMillis(),
      ),
      loading: live.loading,
      error: live.error,
    }),
    [live],
  );
}

/**
 * Returns the status it landed in, so the caller knows whether to celebrate
 * coins or a submission.
 *
 * Pass `todayEntries` — every entry this member already has for this
 * (task, day) from the snapshot the screen already holds, oldest first — so
 * `targetEntrySlot` can tell a repeat tap on a settled task apart from a
 * genuinely new completion under `dailyLimit`. The document id for whichever
 * slot it picks is idempotent but the ledger row is not, so the rules deny
 * the overwrite rather than pay twice; a tap with no slot left (`null`) is a
 * no-op that returns the last known status instead of surfacing an error. A
 * trailing rejected entry is a redo, not a repeat, and falls through to the
 * write regardless of how much of the day's allowance is already claimed.
 */
export async function completeTask(
  task: Task,
  memberId: string,
  dateKey: string,
  actorUid: string,
  todayEntries: Entry[],
  /** Already uploaded by the caller; only the path is recorded here. */
  photoPath?: string,
): Promise<EntryStatus> {
  const slot = targetEntrySlot(todayEntries, task.dailyLimit ?? 1);
  if (!slot) return todayEntries.at(-1)?.status ?? "approved";
  const firestore = db();
  const { id, ...fields } = buildEntry(task, memberId, dateKey, slot.seq);
  const batch = writeBatch(firestore);
  batch.set(
    doc(firestore, COL, id),
    clean({
      ...fields,
      ...(photoPath ? { photoPath, photoAt: serverTimestamp() } : {}),
    }),
  );
  if (fields.status === "approved" && task.coin !== 0) {
    applyCoinMovement(
      batch,
      firestore,
      {
        householdId: task.householdId,
        memberId,
        delta: task.coin,
        reason: "task",
        entryId: id,
        actorId: actorUid,
      },
      task.coin,
    );
  }
  await batch.commit();
  return fields.status;
}

/**
 * Take a completion back. The entry goes, but the coins it paid are reversed
 * through a compensating ledger row rather than by deleting the original — the
 * ledger is append-only, and "earned then undone" is worth being able to see.
 */
export async function undoEntry(entry: Entry, actorUid: string): Promise<void> {
  const firestore = db();
  const batch = writeBatch(firestore);
  batch.delete(doc(firestore, COL, entry.id));
  const delta = coinDeltaForUndo(entry);
  if (delta !== 0) {
    applyCoinMovement(
      batch,
      firestore,
      {
        householdId: entry.householdId,
        memberId: entry.memberId,
        delta,
        reason: "adjust",
        entryId: entry.id,
        note: UNDO_NOTE,
        actorId: actorUid,
      },
      delta,
    );
  }
  await batch.commit();

  // After the commit, and deliberately not fatal: the entry is already gone,
  // and a leftover object costs storage rather than correctness. Failing the
  // undo over it would leave the user with a completion they cannot remove.
  if (entry.photoPath) {
    await deleteEntryPhoto(entry.photoPath).catch(() => {});
  }
}

/**
 * Attach or replace the photo on a completion that already exists.
 *
 * Upload first, then record: a path written before the object lands would
 * point at nothing for as long as the upload takes.
 */
export async function setEntryPhoto(entry: Entry, file: File): Promise<void> {
  const photoPath = await uploadEntryPhoto({
    householdId: entry.householdId,
    entryId: entry.id,
    file,
  });
  await updateDoc(doc(db(), COL, entry.id), {
    photoPath,
    photoAt: serverTimestamp(),
  });
}

/** Only a pending entry can be approved; approving twice would pay twice. */
export async function approveEntry(entry: Entry, actorUid: string): Promise<void> {
  if (entry.status !== "pending") return;
  const firestore = db();
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, COL, entry.id), {
    status: "approved",
    decidedBy: actorUid,
    decidedAt: serverTimestamp(),
  });
  if (entry.coin !== 0) {
    applyCoinMovement(
      batch,
      firestore,
      {
        householdId: entry.householdId,
        memberId: entry.memberId,
        delta: entry.coin,
        reason: "task",
        entryId: entry.id,
        actorId: actorUid,
      },
      entry.coin,
    );
  }
  await batch.commit();
}

/** Rejection moves no coins: nothing was ever paid for a pending entry. */
export async function rejectEntry(
  entry: Entry,
  actorUid: string,
  reason: string,
): Promise<void> {
  if (entry.status !== "pending") return;
  await updateDoc(
    doc(db(), COL, entry.id),
    clean({
      status: "rejected",
      decidedBy: actorUid,
      decidedAt: serverTimestamp(),
      rejectReason: reason.trim(),
    }),
  );
}
