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
