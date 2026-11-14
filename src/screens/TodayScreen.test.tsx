// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FestivalDraw, Task } from "../types";
import { todayKey } from "../lib/date";
import { TodayScreen } from "./TodayScreen";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(), complete: vi.fn(), celebrate: vi.fn(),
  members: [{ uid: "u1", role: "child", info: { displayName: "こども", color: "sakura", emoji: "🧱" } }],
  household: { festival: { enabled: true, intervalDays: 1, taskCount: 1, multiplier: 3 } },
  tasks: [] as Task[],
}));
vi.mock("../auth/context", () => ({ useUid: () => "u1" }));
vi.mock("../household/context", () => ({ useHousehold: () => ({
  household: mocks.household, householdId: "h1", members: mocks.members, isParent: false,
}) }));
vi.mock("../effects/context", () => ({ useEffects: () => ({ celebrate: mocks.celebrate, combo: 0 }) }));
vi.mock("../data/tasks", () => ({ useTasks: () => ({ data: mocks.tasks, loading: false, error: null }) }));
vi.mock("../data/entries", () => ({
  completeTask: mocks.complete, nextEntryId: () => "entry", setEntryPhoto: vi.fn(), undoEntry: vi.fn(),
  useEntriesForDate: () => ({ data: [], loading: false, error: null }),
  useRecentEntries: () => ({ data: [], loading: false, error: null }),
}));
vi.mock("../data/festivals", () => ({
  ensureFestivalDraw: mocks.ensure,
  useFestivalDraw: () => ({ data: null, loading: false, error: null }),
}));
vi.mock("../components/TaskRow", () => ({ TaskRow: ({ busy, onComplete }: { busy: boolean; onComplete: (origin: DOMRect) => void }) =>
  <button disabled={busy} onClick={() => onComplete(new DOMRect())}>かんりょう</button>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tasks = [{
    id: "t1", householdId: "h1", title: "そうじ", emoji: "🧹", coin: 10,
    needsApproval: false, assigneeIds: [], repeat: { type: "daily" },
    order: 0, archived: false, createdBy: "u1",
  }];
  mocks.complete.mockResolvedValue("approved");
});
afterEach(cleanup);

const draw = (): FestivalDraw => ({
  id: `h1__${todayKey()}`, householdId: "h1", dateKey: todayKey(),
  taskIds: ["t1"], multiplier: 3, taskMultipliers: { t1: 3 },
});

it("waits for the persisted draw even while the row has no multiplier", async () => {
  let resolve!: (value: FestivalDraw) => void;
  mocks.ensure.mockReturnValue(new Promise<FestivalDraw>((done) => { resolve = done; }));
  render(<TodayScreen />);
  fireEvent.click(screen.getByText("かんりょう"));
  expect(mocks.complete).not.toHaveBeenCalled();
  await act(async () => resolve(draw()));
  await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith(
    mocks.tasks[0], "u1", todayKey(), "u1", [], undefined, 3,
  ));
  expect(mocks.celebrate).toHaveBeenCalledWith("coinfly", expect.objectContaining({ coin: 30 }));
});

it("does not complete on draw failure and allows retry", async () => {
  mocks.ensure.mockRejectedValue(new Error("offline"));
  render(<TodayScreen />);
  fireEvent.click(screen.getByText("かんりょう"));
  await screen.findByText("うまくいきませんでした。もういちど ためしてね");
  expect(mocks.complete).not.toHaveBeenCalled();
  mocks.ensure.mockResolvedValue(draw());
  fireEvent.click(screen.getByText("かんりょう"));
  await waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce());
});
