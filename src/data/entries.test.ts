// Pure rules only — no Firebase in the module graph, so these run without an
// emulator or a mock. The Firestore calls in `entries.ts` are plumbing around
// these two decisions plus one deterministic id.

import { describe, expect, it } from "vitest";
import { entryId } from "../lib/ids";
import { coinDeltaForUndo, statusForTask } from "./entryRules";

describe("statusForTask", () => {
  it("holds a task that needs a parent", () => {
    expect(statusForTask({ needsApproval: true })).toBe("pending");
  });

  it("pays a task that does not", () => {
    expect(statusForTask({ needsApproval: false })).toBe("approved");
  });
});

describe("coinDeltaForUndo", () => {
  it("gives back exactly what an approved entry paid", () => {
    expect(coinDeltaForUndo({ status: "approved", coin: 3 })).toBe(-3);
  });

  it("moves nothing for a pending entry: it never paid", () => {
    expect(coinDeltaForUndo({ status: "pending", coin: 3 })).toBe(0);
  });

  it("moves nothing for a rejected entry", () => {
    expect(coinDeltaForUndo({ status: "rejected", coin: 3 })).toBe(0);
  });
});

describe("entryId", () => {
  it("is stable for the same task, member and day", () => {
    expect(entryId("task1", "member1", "2026-08-23")).toBe(
      entryId("task1", "member1", "2026-08-23"),
    );
  });

  it("differs when any part of the triple differs", () => {
    const base = entryId("task1", "member1", "2026-08-23");
    expect(entryId("task2", "member1", "2026-08-23")).not.toBe(base);
    expect(entryId("task1", "member2", "2026-08-23")).not.toBe(base);
    expect(entryId("task1", "member1", "2026-08-24")).not.toBe(base);
  });
});
