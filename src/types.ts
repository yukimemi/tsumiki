import type { Timestamp } from "firebase/firestore";

/**
 * Domain types for tsumiki. These describe the *read* shape of Firestore
 * documents: every server-written time field is already a `Timestamp` by the
 * time a snapshot reaches the UI. Write payloads are built inside `src/data/*`
 * and may substitute `serverTimestamp()` / `increment()` sentinels.
 *
 * See `docs/DESIGN.md` for the collection layout and the write flows.
 */

export type Role = "owner" | "parent" | "child";

/** Avatar colours. Values map to `--member-*` slots in `src/index.css`. */
export type MemberColor =
  | "sakura"
  | "sora"
  | "wakaba"
  | "yamabuki"
  | "fuji"
  | "kohaku";

export const MEMBER_COLORS: readonly MemberColor[] = [
  "sakura",
  "sora",
  "wakaba",
  "yamabuki",
  "fuji",
  "kohaku",
];

export type MemberInfo = {
  displayName: string;
  email?: string;
  photoURL?: string;
  color: MemberColor;
  emoji: string;
};

/** 0 = Sunday .. 6 = Saturday, matching `Date.prototype.getDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type RepeatRule =
  | { type: "once" }
  | { type: "daily" }
  | { type: "weekly"; weekdays: number[] }
  | { type: "monthly"; days: number[] };

export type RepeatType = RepeatRule["type"];

export type Household = {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  memberRoles: Record<string, Role>;
  memberInfo: Record<string, MemberInfo>;
  /** Verified emails that may claim membership on next sign-in. */
  invitedEmails?: string[];
  /** Role to grant on claim. Key is `encodeEmailKey(email)`. */
  pendingRoles?: Record<string, Role>;
  /** Exchange rate: one coin is worth this many yen. */
  coinYen: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type Task = {
  id: string;
  householdId: string;
  title: string;
  note?: string;
  emoji: string;
  /** Coins granted per completion. */
  coin: number;
  /** When true a completion lands as `pending` and waits for a parent. */
  needsApproval: boolean;
  /** Empty means anyone in the household may do it. */
  assigneeIds: string[];
  repeat: RepeatRule;
  /** "HH:mm" in Asia/Tokyo. Past this time an undone task counts as late. */
  dueTime?: string;
  order: number;
  archived: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  deletedAt?: Timestamp | null;
};

export type EntryStatus = "pending" | "approved" | "rejected";

export type Entry = {
  /** `${taskId}__${memberId}__${dateKey}` — blocks double counting. */
  id: string;
  householdId: string;
  taskId: string;
  /** Snapshot of the task at completion time; tasks may be renamed later. */
  taskTitle: string;
  taskEmoji: string;
  memberId: string;
  /** "YYYY-MM-DD" in Asia/Tokyo. */
  dateKey: string;
  status: EntryStatus;
  /** Snapshot of `Task.coin` at completion time. */
  coin: number;
  note?: string;
  completedAt: Timestamp;
  decidedBy?: string;
  decidedAt?: Timestamp;
  rejectReason?: string;
  commentCount: number;
  lastCommentAt?: Timestamp;
};

export type Comment = {
  id: string;
  householdId: string;
  entryId: string;
  authorId: string;
  text: string;
  /** A single emoji shown large next to the text. */
  stamp?: string;
  replyToId?: string;
  createdAt: Timestamp;
  deletedAt?: Timestamp | null;
};

export type LedgerReason = "task" | "bonus" | "adjust" | "payout";

/** Append-only. Rules forbid update and delete. */
export type LedgerEntry = {
  id: string;
  householdId: string;
  memberId: string;
  delta: number;
  reason: LedgerReason;
  entryId?: string;
  payoutId?: string;
  note?: string;
  actorId: string;
  createdAt: Timestamp;
};

/** Cache of the ledger sum. Rebuildable via `scripts/recalc-balances.ts`. */
export type Balance = {
  /** `${householdId}__${memberId}` */
  id: string;
  householdId: string;
  memberId: string;
  /** Spendable coins. */
  coins: number;
  /** Lifetime earned coins; never decreases. Drives levels and badges. */
  earned: number;
  updatedAt: Timestamp;
};

export type PayoutStatus = "requested" | "paid" | "rejected";

export type Payout = {
  id: string;
  householdId: string;
  memberId: string;
  coins: number;
  /** Yen locked in at request time using the household's `coinYen`. */
  yen: number;
  status: PayoutStatus;
  note?: string;
  requestedAt: Timestamp;
  decidedBy?: string;
  decidedAt?: Timestamp;
};

export type UserDoc = {
  id: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  updatedAt?: Timestamp;
};

/** Uniform shape returned by every live-subscription hook in `src/data`. */
export type Live<T> = {
  data: T;
  loading: boolean;
  error: Error | null;
};
