// The ledger is the only truth about coins. `balances` is a cache of its sum,
// written in the same batch as the row that changed it, so the two can only
// disagree if a batch is lost — and `scripts/recalc-balances.ts` rebuilds the
// cache from the ledger when that happens.
//
// `coins` is spendable; `earned` is the lifetime total that drives streaks and
// badges. A payout spends coins without touching earned, and a manual deduction
// does not take back an achievement either. Undoing a completion is the one case
// that lowers `earned`, because the achievement itself was withdrawn — see
// `undoEntry`.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { balanceId } from "../lib/ids";
import type { Balance, LedgerEntry, LedgerReason, Live, Payout } from "../types";
import { useLiveDocs } from "./live";
import { clean } from "./sanitise";

const LEDGER = "ledger";
const BALANCES = "balances";
const PAYOUTS = "payouts";

const DEFAULT_LEDGER_LIMIT = 60;

export type CoinMovement = {
  householdId: string;
  memberId: string;
  delta: number;
  reason: LedgerReason;
  entryId?: string;
  payoutId?: string;
  note?: string;
  actorId: string;
};

/**
 * Append the ledger row and move the cached balance together. Callers add this
 * to a batch that also carries whatever caused the movement, so a completion
 * can never be recorded without its coins or vice versa.
 *
 * The balance is a `setDoc` merge rather than an update: the first coin a member
 * ever earns creates the document, and reading first to find out would race.
 * `earned` is always incremented — by zero when the movement is a spend — so the
 * field exists as a number from the very first write.
 */
export function applyCoinMovement(
  batch: WriteBatch,
  firestore: Firestore,
  move: CoinMovement,
  earnedDelta: number,
): void {
  batch.set(
    doc(collection(firestore, LEDGER)),
    clean({ ...move, createdAt: serverTimestamp() }),
  );
  batch.set(
    doc(firestore, BALANCES, balanceId(move.householdId, move.memberId)),
    {
      householdId: move.householdId,
      memberId: move.memberId,
      coins: increment(move.delta),
      earned: increment(earnedDelta),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function useBalances(householdId: string | null): Live<Balance[]> {
  return useLiveDocs<Balance>(
    householdId
      ? () => query(collection(db(), BALANCES), where("householdId", "==", householdId))
      : null,
    (d) => ({ ...(d.data() as Omit<Balance, "id">), id: d.id }),
    [householdId],
  );
}

export function useLedger(
  householdId: string | null,
  memberId?: string | null,
  max = DEFAULT_LEDGER_LIMIT,
): Live<LedgerEntry[]> {
  return useLiveDocs<LedgerEntry>(
    householdId
      ? () => {
          const rows = collection(db(), LEDGER);
          const mine = where("householdId", "==", householdId);
          const newestFirst = orderBy("createdAt", "desc");
          return memberId
            ? query(rows, mine, where("memberId", "==", memberId), newestFirst, limit(max))
            : query(rows, mine, newestFirst, limit(max));
        }
      : null,
    (d) => ({ ...(d.data() as Omit<LedgerEntry, "id">), id: d.id }),
    [householdId, memberId ?? "", max],
  );
}

export function usePayouts(householdId: string | null): Live<Payout[]> {
  return useLiveDocs<Payout>(
    householdId
      ? () =>
          query(
            collection(db(), PAYOUTS),
            where("householdId", "==", householdId),
            orderBy("requestedAt", "desc"),
          )
      : null,
    (d) => ({ ...(d.data() as Omit<Payout, "id">), id: d.id }),
    [householdId],
  );
}

/** Parent-side bonus or correction. */
export async function adjustCoins(input: {
  householdId: string;
  memberId: string;
  delta: number;
  reason: Extract<LedgerReason, "bonus" | "adjust">;
  note?: string;
  actorUid: string;
}): Promise<void> {
  if (input.delta === 0) return;
  const firestore = db();
  const batch = writeBatch(firestore);
  applyCoinMovement(
    batch,
    firestore,
    {
      householdId: input.householdId,
      memberId: input.memberId,
      delta: input.delta,
      reason: input.reason,
      note: input.note,
      actorId: input.actorUid,
    },
    Math.max(0, input.delta),
  );
  await batch.commit();
}

/**
 * Ask for coins to become pocket money. Nothing moves yet — the yen figure is
 * locked in now so a later rate change cannot rewrite what was promised.
 */
export async function requestPayout(input: {
  householdId: string;
  memberId: string;
  coins: number;
  coinYen: number;
  note?: string;
}): Promise<void> {
  if (input.coins <= 0) return;
  await addDoc(
    collection(db(), PAYOUTS),
    clean({
      householdId: input.householdId,
      memberId: input.memberId,
      coins: input.coins,
      yen: input.coins * input.coinYen,
      status: "requested",
      note: input.note,
      requestedAt: serverTimestamp(),
    }),
  );
}

export async function payPayout(payout: Payout, actorUid: string): Promise<void> {
  if (payout.status !== "requested") return;
  const firestore = db();
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, PAYOUTS, payout.id), {
    status: "paid",
    decidedBy: actorUid,
    decidedAt: serverTimestamp(),
  });
  applyCoinMovement(
    batch,
    firestore,
    {
      householdId: payout.householdId,
      memberId: payout.memberId,
      delta: -payout.coins,
      reason: "payout",
      payoutId: payout.id,
      actorId: actorUid,
    },
    0,
  );
  await batch.commit();
}

export async function rejectPayout(payout: Payout, actorUid: string): Promise<void> {
  if (payout.status !== "requested") return;
  await updateDoc(doc(db(), PAYOUTS, payout.id), {
    status: "rejected",
    decidedBy: actorUid,
    decidedAt: serverTimestamp(),
  });
}

/**
 * Withdraw your own request before anyone has acted on it.
 *
 * Deleted rather than given a `cancelled` status: nothing moved. No coins left
 * the balance and no ledger row was written, so there is no history here worth
 * keeping — only a row that would sit in everyone's list forever. A parent
 * turning a request down is different, and that one keeps its `rejected` row.
 */
export async function cancelPayout(payout: Payout, uid: string): Promise<void> {
  if (payout.status !== "requested" || payout.memberId !== uid) return;
  await deleteDoc(doc(db(), PAYOUTS, payout.id));
}

export function balanceOf(balances: Balance[], memberId: string): Balance | null {
  return balances.find((b) => b.memberId === memberId) ?? null;
}
