// users/{uid} is written on every sign-in and nowhere else. There is no
// onboarding step: the Google profile is the profile, so a merge on sign-in is
// both the creation and the refresh. Everything else that needs a name or an
// avatar reads it from `Household.memberInfo`, which is denormalised on
// purpose — a member list must not fan out into one read per member.
//
// Nothing reads anyone else's document, which is what lets the rules restrict
// this collection to its owner. Keep it that way: with open signup, a readable
// `users` collection is every address in the database.

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../lib/firebase";
import type { Live, UserDoc } from "../types";
import { useLiveDoc } from "./live";
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

/**
 * The signed-in user's own document, live.
 *
 * Only ever used for state that belongs to the person rather than the family —
 * right now, how far they have read. Names and avatars come from
 * `Household.memberInfo`, which is denormalised so a member list is one read.
 */
export function useUserDoc(uid: string | null): Live<UserDoc | null> {
  return useLiveDoc<UserDoc>(
    uid ? () => doc(db(), COL, uid) : null,
    (snap) =>
      snap.exists() ? { ...(snap.data() as Omit<UserDoc, "id">), id: snap.id } : null,
    [uid],
  );
}

/**
 * Mark every comment in this household as seen, as of now.
 *
 * One marker per household, moved when a thread is opened. Opening one thread
 * therefore clears the badge for all of them — the alternative, a marker per
 * entry, is a map that grows for as long as the family uses the app. The badge
 * exists to say "go and look", and they have looked.
 */
export async function markCommentsSeen(
  uid: string,
  householdId: string,
): Promise<void> {
  await setDoc(
    doc(db(), COL, uid),
    { commentsSeenAt: { [householdId]: serverTimestamp() } },
    { merge: true },
  );
}
