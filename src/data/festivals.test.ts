import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FestivalDraw, FestivalSettings, Task } from "../types";

const store = new Map<string, Record<string, unknown>>();
const setSpy = vi.fn();

vi.mock("../lib/firebase", () => ({
  db: () => ({}),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, col: string, id: string) => ({
    id,
    path: `${col}/${id}`,
  }),
  serverTimestamp: () => "SERVER_TS",
  onSnapshot: vi.fn(),
  runTransaction: async (
    _db: unknown,
    updateFunction: (tx: {
      get: (ref: { id: string; path: string }) => Promise<{
        id: string;
        exists: () => boolean;
        data: () => Record<string, unknown> | undefined;
      }>;
      set: (
        ref: { id: string; path: string },
        data: Record<string, unknown>,
      ) => void;
    }) => Promise<unknown>,
  ) => {
    const tx = {
      get: async (ref: { id: string; path: string }) => {
        const existing = store.get(ref.path);
        return {
          id: ref.id,
          exists: () => existing !== undefined,
          data: () => existing,
        };
      },
      set: (
        ref: { id: string; path: string },
        data: Record<string, unknown>,
      ) => {
        setSpy(ref.path, data);
        store.set(ref.path, data);
      },
    };
    return updateFunction(tx);
  },
}));

import { ensureFestivalDraw } from "./festivals";

function makeTask(id: string): Task {
  return {
    id,
    householdId: "h1",
    title: `タスク ${id}`,
    emoji: "🧹",
    coin: 10,
    needsApproval: false,
    assigneeIds: [],
    repeat: { type: "daily" },
    order: 0,
    archived: false,
    createdBy: "u1",
  };
}

const DATE = "2026-08-23";
const settings: FestivalSettings = {
  enabled: true,
  intervalDays: 1,
  taskCount: 1,
  multiplier: 3,
  anchorDate: DATE,
};

beforeEach(() => {
  store.clear();
  setSpy.mockClear();
});

describe("ensureFestivalDraw", () => {
  it("persists a draw once with deterministic id and returns the existing draw on subsequent or concurrent calls", async () => {
    const tasks = [makeTask("t1"), makeTask("t2"), makeTask("t3")];

    // Two concurrent calls with different RNGs must converge on a single draw.
    const [drawA, drawB] = await Promise.all([
      ensureFestivalDraw({
        householdId: "h1",
        dateKey: DATE,
        tasks,
        settings,
        rng: () => 0.0,
      }),
      ensureFestivalDraw({
        householdId: "h1",
        dateKey: DATE,
        tasks,
        settings,
        rng: () => 0.99,
      }),
    ]);

    expect(drawA).not.toBeNull();
    expect(drawB).toEqual(drawA);
    expect(drawA!.id).toBe(`h1__${DATE}`);
    expect(setSpy).toHaveBeenCalledTimes(1);

    // A later call from another device (after in-flight has settled) sees the
    // stored document in the transaction and does not write again.
    const drawC: FestivalDraw | null = await ensureFestivalDraw({
      householdId: "h1",
      dateKey: DATE,
      tasks,
      settings: { ...settings, multiplier: 5 },
      rng: () => 0.5,
    });

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(drawC?.taskIds).toEqual(drawA!.taskIds);
    expect(drawC?.multiplier).toBe(3);
  });
});
