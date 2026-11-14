import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FestivalDraw, FestivalSettings, Task } from "../types";

const store = new Map<string, Record<string, unknown>>();
const setSpy = vi.fn();
const historySpy = vi.hoisted(() => vi.fn());
const tasksSpy = vi.hoisted(() => vi.fn());

vi.mock("../lib/firebase", () => ({
  db: () => ({}),
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, name: string) => name,
  query: (name: string, filter: unknown) => ({ name, filter }),
  where: (field: string, operator: string, value: string) => ({ field, operator, value }),
  getDocsFromServer: (query: { name: string; filter: unknown }) =>
    query.name === "tasks" ? tasksSpy(query.filter) : historySpy(query.filter),
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
  historySpy.mockReset().mockResolvedValue({ docs: [] });
  tasksSpy.mockReset().mockResolvedValue(taskSnapshot([makeTask("t1")]));
});

function taskSnapshot(tasks: Task[]) {
  return { docs: tasks.map((task) => ({ id: task.id, data: () => task })) };
}

describe("ensureFestivalDraw", () => {
  it("persists a draw once with deterministic id and returns the existing draw on subsequent or concurrent calls", async () => {
    const tasks = [makeTask("t1"), makeTask("t2"), makeTask("t3")];
    tasksSpy.mockResolvedValue(taskSnapshot(tasks));

    // Two concurrent calls with different RNGs must converge on a single draw.
    const [drawA, drawB] = await Promise.all([
      ensureFestivalDraw({
        householdId: "h1",
        dateKey: DATE,
        memberIds: ["u1"],
        settings,
        rng: () => 0.0,
      }),
      ensureFestivalDraw({
        householdId: "h1",
        dateKey: DATE,
        memberIds: ["u1"],
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
      memberIds: ["u1"],
      settings: { ...settings, multiplier: 5 },
      rng: () => 0.5,
    });

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(drawC?.taskIds).toEqual(drawA!.taskIds);
    expect(drawC?.multiplier).toBe(3);
  });

  it("waits for history and propagates failure so completion can retry", async () => {
    const input = { householdId: "h1", dateKey: DATE, memberIds: ["u1"], settings };
    let rejectHistory!: (reason: Error) => void;
    historySpy.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectHistory = reject; }));
    const pending = ensureFestivalDraw(input);
    await vi.waitFor(() => expect(historySpy).toHaveBeenCalledOnce());
    expect(setSpy).not.toHaveBeenCalled();
    rejectHistory(new Error("offline"));
    await expect(pending).rejects.toThrow("offline");
    expect(setSpy).not.toHaveBeenCalled();
    const draw = await ensureFestivalDraw(input);
    expect(draw?.taskMultipliers.t1).toBe(3);
  });

  it("preserves an empty draw and reads stored draws even after settings are disabled", async () => {
    tasksSpy.mockResolvedValue(taskSnapshot([]));
    const input = { householdId: "h1", dateKey: DATE, memberIds: ["u1"], settings };
    const first = await ensureFestivalDraw(input);
    expect(first?.taskIds).toEqual([]);
    tasksSpy.mockResolvedValue(taskSnapshot([makeTask("t1")]));
    const second = await ensureFestivalDraw({ ...input, settings: undefined });
    expect(second).toMatchObject(first!);
    expect(setSpy).toHaveBeenCalledOnce();
    expect(tasksSpy).toHaveBeenCalledOnce();
  });

  it("uses server schedules and additions instead of stale caller candidates", async () => {
    const input = {
      householdId: "h1", dateKey: DATE, memberIds: ["u1"], settings,
      // A stale caller value cannot participate in candidate selection.
      tasks: [makeTask("t1"), makeTask("archived")],
    };
    tasksSpy.mockResolvedValue(taskSnapshot([
      { ...makeTask("t1"), repeat: { type: "weekly", weekdays: [1] } },
      { ...makeTask("archived"), archived: true },
      makeTask("t2"),
    ]));
    const draw = await ensureFestivalDraw(input);
    expect(draw?.taskIds).toEqual(["t2"]);
    expect(tasksSpy).toHaveBeenCalledWith({ field: "householdId", operator: "==", value: "h1" });
    expect(setSpy).toHaveBeenCalledOnce();
  });

  it("waits for server tasks and leaves no draw on read failure so retry can succeed", async () => {
    const input = { householdId: "h1", dateKey: DATE, memberIds: ["u1"], settings };
    let rejectTasks!: (reason: Error) => void;
    tasksSpy.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectTasks = reject; }));
    const pending = ensureFestivalDraw(input);
    await vi.waitFor(() => expect(tasksSpy).toHaveBeenCalledOnce());
    expect(setSpy).not.toHaveBeenCalled();
    rejectTasks(new Error("offline"));
    await expect(pending).rejects.toThrow("offline");
    expect(setSpy).not.toHaveBeenCalled();
    expect((await ensureFestivalDraw(input))?.taskIds).toEqual(["t1"]);
    expect(setSpy).toHaveBeenCalledOnce();
  });
});
