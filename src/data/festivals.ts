// Daily random festival draws, persisted once per (household, dateKey) pair.
//
// Two devices opening the Today screen on the same morning must agree on which
// chores are festival tasks, and completing a task must never re-roll the day's
// draw. The document id is deterministic (`${householdId}__${dateKey}`), the
// write goes through a Firestore transaction that checks `snap.exists()` before
// setting, and `firestore.rules` allows `create` only (`allow update: if false`).

import {
  doc,
  runTransaction,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  drawFestivalTasks,
  festivalCandidatesForDate,
  isFestivalDay,
} from "../lib/festival";
import { festivalDrawId } from "../lib/ids";
import type { FestivalDraw, FestivalSettings, Live, Task } from "../types";
import { useLiveDoc } from "./live";
import { forWrite } from "./sanitise";

const COL = "festivalDraws";

/** Deduplicates concurrent calls within the same tab across re-renders. */
const inFlight = new Map<string, Promise<FestivalDraw | null>>();

function mapDraw(snap: DocumentSnapshot<DocumentData>): FestivalDraw | null {
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<FestivalDraw, "id">), id: snap.id };
}

export function useFestivalDraw(
  householdId: string | null,
  dateKey: string,
): Live<FestivalDraw | null> {
  return useLiveDoc<FestivalDraw>(
    householdId
      ? () => doc(db(), COL, festivalDrawId(householdId, dateKey))
      : null,
    mapDraw,
    [householdId, dateKey],
  );
}

export async function ensureFestivalDraw(input: {
  householdId: string;
  dateKey: string;
  tasks: readonly Task[];
  settings: FestivalSettings | undefined;
  rng?: () => number;
}): Promise<FestivalDraw | null> {
  const { householdId, dateKey, tasks, settings, rng } = input;
  if (!settings || !isFestivalDay(dateKey, settings)) return null;
  const candidates = festivalCandidatesForDate(tasks, dateKey);
  if (candidates.length === 0) return null;

  const id = festivalDrawId(householdId, dateKey);
  const running = inFlight.get(id);
  if (running) return running;

  const task = (async (): Promise<FestivalDraw | null> => {
    const firestore = db();
    const ref = doc(firestore, COL, id);
    return runTransaction(firestore, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        return { ...(snap.data() as Omit<FestivalDraw, "id">), id: snap.id };
      }
      const drawn = drawFestivalTasks({
        householdId,
        dateKey,
        tasks,
        settings,
        rng,
      });
      if (!drawn) return null;
      tx.set(
        ref,
        forWrite({
          householdId: drawn.householdId,
          dateKey: drawn.dateKey,
          taskIds: drawn.taskIds,
          multiplier: drawn.multiplier,
          taskMultipliers: drawn.taskMultipliers,
        }),
      );
      return drawn;
    });
  })();

  inFlight.set(id, task);
  try {
    return await task;
  } finally {
    inFlight.delete(id);
  }
}
