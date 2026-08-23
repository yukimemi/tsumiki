// Comments on a completion — the praise half of the app. A stamp alone counts
// as a comment, which is the point: a child who cannot type yet can still say
// well done.
//
// `Entry.commentCount` and `lastCommentAt` are maintained in the same batch as
// the comment itself. The timeline shows "3 comments" for dozens of entries at
// once, and reading every thread to count them would be dozens of queries per
// screen. The price is that the counter and the thread must never be written
// apart — hence the batch.

import {
  collection,
  doc,
  increment,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { useMemo } from "react";
import { db } from "../lib/firebase";
import type { Comment, Live } from "../types";
import { useLiveDocs } from "./live";

const COL = "comments";
const ENTRIES = "entries";

function mapComment(d: QueryDocumentSnapshot<DocumentData>): Comment {
  return { ...(d.data() as Omit<Comment, "id">), id: d.id };
}

/**
 * One thread, oldest first. Sorted and soft-delete-filtered here rather than
 * in the query: a thread is a handful of documents, and doing it server-side
 * would cost a composite index for no benefit.
 *
 * `householdId` is not redundant. Firestore evaluates a `list` rule against
 * the query's own filters, so any field the rule reads must be constrained by
 * the query — without this equality the rule's `resource.data.householdId` is
 * unbound and every read is denied, even for an empty thread.
 */
export function useComments(
  householdId: string | null,
  entryId: string | null,
): Live<Comment[]> {
  const live = useLiveDocs<Comment>(
    householdId && entryId
      ? () =>
          query(
            collection(db(), COL),
            where("householdId", "==", householdId),
            where("entryId", "==", entryId),
          )
      : null,
    mapComment,
    [householdId, entryId],
  );
  return useMemo(
    () => ({
      data: live.data
        .filter((c) => !c.deletedAt)
        .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis()),
      loading: live.loading,
      error: live.error,
    }),
    [live],
  );
}

export async function addComment(input: {
  householdId: string;
  entryId: string;
  authorId: string;
  text: string;
  stamp?: string;
  replyToId?: string;
}): Promise<void> {
  const text = input.text.trim();
  const stamp = input.stamp?.trim();
  // Nothing to say and nothing to stamp: posting would only inflate the counter.
  if (!text && !stamp) return;

  const firestore = db();
  const payload: Record<string, unknown> = {
    householdId: input.householdId,
    entryId: input.entryId,
    authorId: input.authorId,
    text,
    createdAt: serverTimestamp(),
    deletedAt: null,
  };
  if (stamp) payload.stamp = stamp;
  if (input.replyToId) payload.replyToId = input.replyToId;

  const batch = writeBatch(firestore);
  batch.set(doc(collection(firestore, COL)), payload);
  batch.update(doc(firestore, ENTRIES, input.entryId), {
    commentCount: increment(1),
    lastCommentAt: serverTimestamp(),
    // Read by the unread badge so my own comment on my own entry is not
    // announced back to me.
    lastCommentBy: input.authorId,
  });
  await batch.commit();
}

/** Soft delete: replies point at their parent, and the thread has to hold. */
export async function deleteComment(comment: Comment): Promise<void> {
  if (comment.deletedAt) return;
  const firestore = db();
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, COL, comment.id), {
    deletedAt: serverTimestamp(),
  });
  batch.update(doc(firestore, ENTRIES, comment.entryId), {
    commentCount: increment(-1),
  });
  await batch.commit();
}
