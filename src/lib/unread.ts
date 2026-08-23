import type { Entry } from "../types";

/**
 * Which of my completions have a comment I have not seen.
 *
 * Scope is deliberately narrow: comments on *my own* entries, written by
 * someone else. A child needs to notice being praised; a running tally of every
 * conversation in the family would sit at a permanent non-zero and stop meaning
 * anything.
 *
 * `lastCommentBy` is missing on entries commented on before it was recorded.
 * Those count as unread — erring towards showing a badge that turns out to be
 * my own comment beats silently swallowing a real one.
 */
export function unreadEntryIds(input: {
  entries: Entry[];
  memberId: string;
  /** `null` when the marker has not loaded or was never written. */
  seenAtMillis: number | null;
}): string[] {
  const { entries, memberId, seenAtMillis } = input;
  const since = seenAtMillis ?? 0;

  return entries
    .filter((entry) => {
      if (entry.memberId !== memberId) return false;
      if (entry.lastCommentBy === memberId) return false;
      const at = entry.lastCommentAt?.toMillis();
      return at !== undefined && at > since;
    })
    .map((entry) => entry.id);
}
