// The household document is the membership and RBAC root: every rule for every
// other collection resolves to one `get()` of it. That is why roles, names,
// colours and emoji live denormalised in maps here instead of in `users/{uid}`
// — rendering a family list must not cost one read per member.

import {
  addDoc,
  arrayRemove,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../lib/firebase";
import type { Household, Live, MemberInfo, Role } from "../types";
import { useLiveDocs } from "./live";
import { clean, forMerge, forWrite } from "./sanitise";
import { addAccessGrant, removeAccessGrant, revokeAllGrantsForHousehold } from "./invites";

const COL = "households";

/** One coin is worth ten yen until a parent changes the rate. */
const DEFAULT_COIN_YEN = 10;

/** Everything keyed by `householdId`, in cascade-delete order. */
const CHILD_COLLECTIONS = [
  "tasks",
  "entries",
  "comments",
  "ledger",
  "balances",
  "payouts",
] as const;

/** A batch holds 500 writes; leave headroom rather than count exactly. */
const BATCH_LIMIT = 400;

export function useHouseholds(uid: string | null): Live<Household[]> {
  return useLiveDocs<Household>(
    uid
      ? () => query(collection(db(), COL), where("memberIds", "array-contains", uid))
      : null,
    (d) => ({ ...(d.data() as Omit<Household, "id">), id: d.id }),
    [uid],
  );
}

export async function createHousehold(
  user: User,
  name: string,
  info: Pick<MemberInfo, "displayName" | "color" | "emoji">,
): Promise<string> {
  const member: MemberInfo = {
    ...info,
    email: user.email ?? undefined,
    photoURL: user.photoURL ?? undefined,
  };
  const ref = await addDoc(
    collection(db(), COL),
    forWrite({
      name: name.trim(),
      ownerId: user.uid,
      memberIds: [user.uid],
      memberRoles: { [user.uid]: "owner" },
      memberInfo: { [user.uid]: clean(member) },
      coinYen: DEFAULT_COIN_YEN,
    }),
  );
  // The creator needs a grant too, otherwise deleting a household they were
  // invited to would revoke the access they still need for this one.
  if (user.email) await addAccessGrant(user.email, ref.id);
  return ref.id;
}

export async function updateHousehold(
  id: string,
  patch: Partial<
    Pick<Household, "name" | "coinYen" | "payoutMinYen" | "payoutStepYen">
  >,
): Promise<void> {
  await updateDoc(doc(db(), COL, id), forMerge(patch));
}

export async function setMemberRole(
  id: string,
  uid: string,
  role: Role,
): Promise<void> {
  await updateDoc(doc(db(), COL, id), {
    [`memberRoles.${uid}`]: role,
    updatedAt: serverTimestamp(),
  });
}

/** Field paths, not a whole-map write: two parents editing at once must not
 *  overwrite each other's entry. */
export async function updateMemberInfo(
  id: string,
  uid: string,
  patch: Partial<MemberInfo>,
): Promise<void> {
  const fields: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [key, value] of Object.entries(clean(patch))) {
    fields[`memberInfo.${uid}.${key}`] = value;
  }
  await updateDoc(doc(db(), COL, id), fields);
}

export async function removeMember(id: string, uid: string): Promise<void> {
  const ref = doc(db(), COL, id);
  // Read the email before it goes: it is the key the access grant is filed under.
  const snap = await getDoc(ref);
  const email = (snap.data() as Omit<Household, "id"> | undefined)?.memberInfo?.[uid]?.email;
  await updateDoc(ref, {
    memberIds: arrayRemove(uid),
    [`memberRoles.${uid}`]: deleteField(),
    [`memberInfo.${uid}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });
  if (email) await removeAccessGrant(email, id);
}

/**
 * Cascade by hand — Firestore deletes no children for you, and orphaned rows
 * would still satisfy `where("householdId","==",id)` for whoever recreates
 * that id. The household document goes last so the rules can still resolve
 * membership while the children are being removed.
 */
export async function deleteHousehold(id: string): Promise<void> {
  const firestore = db();
  const snaps = await Promise.all(
    CHILD_COLLECTIONS.map((col) =>
      getDocs(query(collection(firestore, col), where("householdId", "==", id))),
    ),
  );

  let batch = writeBatch(firestore);
  let pending = 0;
  for (const snap of snaps) {
    for (const d of snap.docs) {
      batch.delete(d.ref);
      pending += 1;
      if (pending < BATCH_LIMIT) continue;
      await batch.commit();
      batch = writeBatch(firestore);
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();

  await revokeAllGrantsForHousehold(id);
  await deleteDoc(doc(firestore, COL, id));
}
