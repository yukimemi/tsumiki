import { describe, expect, it } from "vitest";

import { balanceId, entryId, entrySeq, virtualMemberId } from "./ids";

describe("entrySeq", () => {
  it("inverts entryId for the first slot and any slot beyond it", () => {
    for (const seq of [1, 2, 5]) {
      const id = entryId("task-1", "member-1", "2026-08-30", seq);
      expect(entrySeq(id, "task-1", "member-1", "2026-08-30")).toBe(seq);
    }
  });
});

describe("virtualMemberId", () => {
  it("never collides with a Firebase Auth uid or contains the id separator", () => {
    const id = virtualMemberId();
    // Firebase Auth uids never contain a literal hyphen-delimited "virtual-"
    // prefix, so this can never alias a real member.
    expect(id.startsWith("virtual-")).toBe(true);
    // `entryId`/`balanceId` concatenate with "__"; a virtual id containing it
    // would make those ids ambiguous to split even though nothing parses
    // them today.
    expect(id).not.toContain("__");
  });

  it("generates a fresh id on every call", () => {
    expect(virtualMemberId()).not.toBe(virtualMemberId());
  });

  it("still composes cleanly into entry and balance ids", () => {
    const id = virtualMemberId();
    expect(entryId("task-1", id, "2026-08-30")).toBe(
      `task-1__${id}__2026-08-30`,
    );
    expect(balanceId("h1", id)).toBe(`h1__${id}`);
  });
});
