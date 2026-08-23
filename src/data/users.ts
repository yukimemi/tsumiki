// users/{uid} is written on every sign-in and nowhere else. There is no
// onboarding step: the Google profile is the profile, so a merge on sign-in is
// both the creation and the refresh. Everything else that needs a name or an
// avatar reads it from `Household.memberInfo`, which is denormalised on
// purpose — a member list must not fan out into one read per member.

import { doc, getDoc, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../lib/firebase";
import type { UserDoc } from "../types";
import { forMerge } from "./sanitise";

const COL = "users";

export async function syncUserDoc(user: User): Promise<void> {
  await setDoc(
    doc(db(), COL, user.uid),
    forMerge({
      email: user.email ?? undefined,
      displayName: user.displayName ?? undefined,
      photoURL: user.photoURL ?? undefined,
    }),
    { merge: true },
  );
}

export async function fetchUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db(), COL, uid));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<UserDoc, "id">), id: snap.id };
}
