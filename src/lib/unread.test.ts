import { describe, expect, it } from "vitest";

import { unreadEntryIds } from "./unread";
import type { Timestamp } from "firebase/firestore";
import type { Entry } from "../types";

/** Only `toMillis` is read, so that is all a fixture needs to provide. */
function at(millis: number): Timestamp {
  return { toMillis: () => millis } as Timestamp;
}

function entry(over: Partial<Entry> & Pick<Entry, "id">): Entry {
  return {
    householdId: "h1",
    taskId: "t1",
    taskTitle: "おてつだい",
    taskEmoji: "🧱",
    memberId: "me",
    dateKey: "2026-08-23",
    status: "approved",
    coin: 3,
    completedAt: at(0),
    commentCount: 1,
    ...over,
  };
}

const ME = "me";

describe("unreadEntryIds", () => {
  it("finds a comment left by someone else after the marker", () => {
    const rows = [
      entry({ id: "a", lastCommentAt: at(200), lastCommentBy: "mum" }),
    ];
    expect(unreadEntryIds({ entries: rows, memberId: ME, seenAtMillis: 100 })).toEqual([
      "a",
    ]);
  });

  it("ignores a comment older than the marker", () => {
    const rows = [
      entry({ id: "a", lastCommentAt: at(50), lastCommentBy: "mum" }),
    ];
    expect(
      unreadEntryIds({ entries: rows, memberId: ME, seenAtMillis: 100 }),
    ).toEqual([]);
  });

  it("ignores an entry that is not mine, however new the comment", () => {
    const rows = [
      entry({
        id: "a",
        memberId: "sibling",
        lastCommentAt: at(900),
        lastCommentBy: "mum",
      }),
    ];
    expect(
      unreadEntryIds({ entries: rows, memberId: ME, seenAtMillis: 100 }),
    ).toEqual([]);
  });

  it("ignores my own comment on my own entry", () => {
    const rows = [entry({ id: "a", lastCommentAt: at(900), lastCommentBy: ME })];
    expect(
      unreadEntryIds({ entries: rows, memberId: ME, seenAtMillis: 100 }),
    ).toEqual([]);
  });

  it("ignores an entry that has never been commented on", () => {
    const rows = [entry({ id: "a", commentCount: 0 })];
    expect(
      unreadEntryIds({ entries: rows, memberId: ME, seenAtMillis: 100 }),
    ).toEqual([]);
  });

  it("treats everything as unread before the first marker exists", () => {
    const rows = [
      entry({ id: "a", lastCommentAt: at(1), lastCommentBy: "mum" }),
    ];
    expect(
      unreadEntryIds({ entries: rows, memberId: ME, seenAtMillis: null }),
    ).toEqual(["a"]);
  });

  it("counts a comment with no recorded author, so an old one is not lost", () => {
    const rows = [entry({ id: "a", lastCommentAt: at(200) })];
    expect(
      unreadEntryIds({ entries: rows, memberId: ME, seenAtMillis: 100 }),
    ).toEqual(["a"]);
  });

  it("returns every unread entry, newest included, and nothing else", () => {
    const rows = [
      entry({ id: "old", lastCommentAt: at(10), lastCommentBy: "mum" }),
      entry({ id: "mine", lastCommentAt: at(500), lastCommentBy: ME }),
      entry({ id: "new", lastCommentAt: at(500), lastCommentBy: "dad" }),
      entry({ id: "other", memberId: "sibling", lastCommentAt: at(500) }),
      entry({ id: "quiet" }),
    ];
    expect(
      unreadEntryIds({ entries: rows, memberId: ME, seenAtMillis: 100 }),
    ).toEqual(["new"]);
  });
});
