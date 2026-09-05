/**
 * Deterministic document ids. Keeping them in one module means the client and
 * `scripts/*` agree on the exact same strings.
 */

/** Separator that cannot appear in a Firestore auto-id or a date key. */
const SEP = "__";

/**
 * One member may complete one task once per day by default. A task with
 * `dailyLimit > 1` gets one more slot per completion beyond the first,
 * `seq` 2, 3, ... — still deterministic, so a retry of the *same* slot lands
 * as the same document instead of paying twice, and a genuinely new
 * completion gets a genuinely new id instead of overwriting the last one.
 */
export function entryId(
  taskId: string,
  memberId: string,
  dateKey: string,
  seq = 1,
): string {
  const base = `${taskId}${SEP}${memberId}${SEP}${dateKey}`;
  return seq <= 1 ? base : `${base}${SEP}${seq}`;
}

/**
 * The inverse of `entryId`: which slot an existing entry occupies. A redo
 * must target the id the entry actually holds, not wherever it happens to
 * sort today — redoing bumps `completedAt` to now, which can push an earlier
 * slot's entry later than a slot opened after it, so array position stops
 * lining up with `seq` the moment more than one redo has happened.
 */
export function entrySeq(
  id: string,
  taskId: string,
  memberId: string,
  dateKey: string,
): number {
  const base = `${taskId}${SEP}${memberId}${SEP}${dateKey}`;
  if (id === base) return 1;
  const match = /^__(\d+)$/.exec(id.slice(base.length));
  return match ? Number(match[1]) : 1;
}

/** One balance document per (household, member) pair. */
export function balanceId(householdId: string, memberId: string): string {
  return `${householdId}${SEP}${memberId}`;
}

/**
 * Firestore map keys cannot contain a dot, so emails used as keys in
 * `Household.pendingRoles` are percent-encoded.
 */
export function encodeEmailKey(email: string): string {
  return email.trim().toLowerCase().replace(/\./g, "%2E");
}

export function decodeEmailKey(key: string): string {
  return key.replace(/%2E/g, ".");
}

/**
 * Id for a member with no device of their own. Deliberately not shaped like a
 * Firebase Auth uid (prefixed, contains no `SEP`), so it can never collide
 * with one and never accidentally parses as part of an entry/balance id.
 */
export function virtualMemberId(): string {
  return `virtual-${crypto.randomUUID()}`;
}
