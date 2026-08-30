// Email invites.
//
// A household is the only membership boundary there is: `invitedEmails` says
// which family wants an address, and claiming it is what turns the invitee
// into a member. There is no second, global list to keep in step — signup is
// self-serve, so an invited person already has an account they can reach the
// app with, and the invite only decides which family they land in.
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
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../lib/firebase";
import { encodeEmailKey } from "../lib/ids";
import { freeMemberColor } from "../lib/roles";
import type { Household, MemberInfo, Role } from "../types";
import { clean } from "./sanitise";

const COL = "households";

/** Emoji a claimed member starts with: a single building block. */
const DEFAULT_EMOJI = "🧱";

function normalise(email: string): string {
  return email.trim().toLowerCase();
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
      color: freeMemberColor(data.memberInfo),
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
