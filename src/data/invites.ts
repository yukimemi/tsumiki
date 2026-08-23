// Email invites, ported from kakeizu.
//
// Two things have to agree before an invited person can write anything:
// `households/{id}.invitedEmails` says which household wants them, and
// `config/access.allowedEmails` is the global gate the rules check first.
// `config/accessGrants` is the reverse index that makes revocation possible:
// without it, removing someone from one household would either strip their
// access to every other household or leave them permanently allowed.
//
// The claim is the only write a non-member is allowed to make against a
// household, and the rule (`isClaiming()`) validates the whole shape at once.
// That is why `claimEmailInvites` builds a single `updateDoc`: splitting it
// would make each half individually illegal.

import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../lib/firebase";
import { encodeEmailKey } from "../lib/ids";
import {
  MEMBER_COLORS,
  type Household,
  type MemberColor,
  type MemberInfo,
  type Role,
} from "../types";
import { clean } from "./sanitise";

const COL = "households";

/** Emoji a claimed member starts with: a single building block. */
const DEFAULT_EMOJI = "🧱";

type Grant = { email: string; householdId: string };

function allowlistDoc() {
  return doc(db(), "config", "access");
}

function grantsDoc() {
  return doc(db(), "config", "accessGrants");
}

function normalise(email: string): string {
  return email.trim().toLowerCase();
}

/** Admins are never locked out, whatever the grant bookkeeping says. */
async function isAdminEmail(email: string): Promise<boolean> {
  try {
    const snap = await getDoc(allowlistDoc());
    const admins = (snap.data()?.adminEmails ?? []) as string[];
    return admins.some((a) => normalise(a) === email);
  } catch {
    return false;
  }
}

async function readGrants(): Promise<Grant[]> {
  const snap = await getDoc(grantsDoc());
  return (snap.data()?.grants ?? []) as Grant[];
}

/**
 * Record that `householdId` vouches for `email`, and open the global gate.
 * Both documents are written with merge so the very first invite in a fresh
 * project does not need a bootstrap step.
 */
export async function addAccessGrant(
  email: string,
  householdId: string,
): Promise<void> {
  const lower = normalise(email);
  if (!lower.includes("@")) return;
  await setDoc(
    grantsDoc(),
    { grants: arrayUnion({ email: lower, householdId }) },
    { merge: true },
  );
  await setDoc(
    allowlistDoc(),
    { allowedEmails: arrayUnion(lower), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Drop one (email, household) grant. The email loses global access only when
 * no other household still vouches for it.
 */
export async function removeAccessGrant(
  email: string,
  householdId: string,
): Promise<void> {
  const lower = normalise(email);
  if (!lower) return;
  await setDoc(
    grantsDoc(),
    { grants: arrayRemove({ email: lower, householdId }) },
    { merge: true },
  );
  if (await isAdminEmail(lower)) return;
  const remaining = await readGrants();
  if (remaining.some((g) => g.email === lower)) return;
  await setDoc(
    allowlistDoc(),
    { allowedEmails: arrayRemove(lower), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Called when a household is deleted: its grants can vouch for nobody. */
export async function revokeAllGrantsForHousehold(
  householdId: string,
): Promise<void> {
  const grants = await readGrants();
  const dropped = grants.filter((g) => g.householdId === householdId);
  if (dropped.length === 0) return;
  await setDoc(
    grantsDoc(),
    { grants: arrayRemove(...dropped) },
    { merge: true },
  );

  const stillVouched = new Set(
    grants
      .filter((g) => g.householdId !== householdId)
      .map((g) => g.email),
  );
  const orphaned: string[] = [];
  for (const email of new Set(dropped.map((g) => g.email))) {
    if (stillVouched.has(email)) continue;
    if (await isAdminEmail(email)) continue;
    orphaned.push(email);
  }
  if (orphaned.length === 0) return;
  await setDoc(
    allowlistDoc(),
    { allowedEmails: arrayRemove(...orphaned), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function inviteByEmail(
  householdId: string,
  email: string,
  role: Role,
): Promise<void> {
  const lower = normalise(email);
  if (!lower.includes("@")) {
    throw new Error("メールアドレスのかたちが正しくありません");
  }
  await updateDoc(doc(db(), COL, householdId), {
    invitedEmails: arrayUnion(lower),
    [`pendingRoles.${encodeEmailKey(lower)}`]: role,
    updatedAt: serverTimestamp(),
  });
  await addAccessGrant(lower, householdId);
}

export async function cancelEmailInvite(
  householdId: string,
  email: string,
): Promise<void> {
  const lower = normalise(email);
  if (!lower) return;
  await updateDoc(doc(db(), COL, householdId), {
    invitedEmails: arrayRemove(lower),
    [`pendingRoles.${encodeEmailKey(lower)}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });
  await removeAccessGrant(lower, householdId);
}

/** First colour nobody in this household is using, so avatars stay distinct. */
function freeColor(memberInfo: Record<string, MemberInfo> | undefined): MemberColor {
  const taken = new Set<MemberColor>();
  for (const info of Object.values(memberInfo ?? {})) taken.add(info.color);
  return MEMBER_COLORS.find((c) => !taken.has(c)) ?? MEMBER_COLORS[0];
}

/**
 * Invitee side, run on every sign-in. Turns each pending invite into real
 * membership. Unverified addresses are skipped: the rules require a verified
 * email, so claiming with one would only produce a permission error.
 */
export async function claimEmailInvites(user: User): Promise<void> {
  if (!user.email || !user.emailVerified) return;
  const email = normalise(user.email);
  const key = encodeEmailKey(email);
  const snap = await getDocs(
    query(collection(db(), COL), where("invitedEmails", "array-contains", email)),
  );

  for (const d of snap.docs) {
    const data = d.data() as Omit<Household, "id">;
    // Already a member — an invite that crossed with a manual add. Just clear
    // the pending state so the settings screen stops offering to cancel it.
    if (data.memberRoles?.[user.uid]) {
      await updateDoc(d.ref, {
        invitedEmails: arrayRemove(email),
        [`pendingRoles.${key}`]: deleteField(),
        updatedAt: serverTimestamp(),
      });
      continue;
    }
    const info: MemberInfo = {
      displayName: user.displayName ?? email.split("@")[0],
      email,
      photoURL: user.photoURL ?? undefined,
      color: freeColor(data.memberInfo),
      emoji: DEFAULT_EMOJI,
    };
    await updateDoc(d.ref, {
      memberIds: arrayUnion(user.uid),
      [`memberRoles.${user.uid}`]: data.pendingRoles?.[key] ?? "child",
      [`memberInfo.${user.uid}`]: clean(info),
      invitedEmails: arrayRemove(email),
      [`pendingRoles.${key}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
  }
}
