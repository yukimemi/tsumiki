import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";

import { addComment, deleteComment, useComments } from "../data/comments";
import { markCommentsSeen } from "../data/users";
import { useEffects } from "../effects/context";
import type { Comment, Entry, MemberInfo, Role } from "../types";
import { Avatar, Badge, Button, Spinner, Textarea } from "./ui";

/**
 * The praise thread under one completion. Self-sufficient: it subscribes to
 * its own comments and writes its own replies, so any screen can drop it into
 * a sheet with just the entry and the member list.
 */

type Member = { uid: string; role: Role; info: MemberInfo };

/** One tap says the whole sentence. Emoji ride as stamps; words as text. */
const STAMPS: readonly { stamp?: string; text: string }[] = [
  { stamp: "🎉", text: "" },
  { stamp: "👏", text: "" },
  { text: "すごいね" },
  { text: "やったね" },
  { text: "ありがとう" },
];

/** Walks up the reply chain to the thread root, so a reply to a reply still
 * lands under the original comment rather than drifting right forever. */
function rootOf(comment: Comment, byId: Map<string, Comment>): string | null {
  if (!comment.replyToId) return null;
  let current = comment;
  const seen = new Set<string>([comment.id]);
  while (current.replyToId) {
    const parent = byId.get(current.replyToId);
    if (!parent || seen.has(parent.id)) break;
    if (!parent.replyToId) return parent.id;
    seen.add(parent.id);
    current = parent;
  }
  return null;
}

export function CommentThread(props: {
  entry: Entry;
  members: Member[];
  currentUid: string;
  canModerate: boolean;
}): JSX.Element {
  const { entry, members, currentUid, canModerate } = props;
  const { celebrate } = useEffects();
  const comments = useComments(entry.householdId, entry.id);

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);


  // Opening a thread is the moment the reader has actually read. Fire and
  // forget: a marker that fails to save costs a badge that lingers, which is
  // the harmless direction.
  const householdId = entry.householdId;
  useEffect(() => {
    void markCommentsSeen(currentUid, householdId).catch(() => {});
  }, [currentUid, householdId]);
  const endRef = useRef<HTMLDivElement>(null);
  const count = comments.data.length;
  useEffect(() => {
    // Newest at the bottom, so a fresh comment should be what you see.
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  const memberById = new Map(members.map((member) => [member.uid, member]));
  const nameOf = (uid: string): string =>
    memberById.get(uid)?.info.displayName ?? "だれか";

  const byId = new Map(comments.data.map((comment) => [comment.id, comment]));
  const roots = comments.data.filter((comment) => !rootOf(comment, byId));
  const repliesUnder = (rootId: string): Comment[] =>
    comments.data.filter((comment) => rootOf(comment, byId) === rootId);

  const fail = (): void => {
    celebrate("quake");
    setError("おくれませんでした。もういちど おしてね");
  };

  const send = async (draft: {
    text: string;
    stamp?: string;
    replyToId?: string;
  }): Promise<void> => {
    setSending(true);
    setError(null);
    try {
      await addComment({
        householdId: entry.householdId,
        entryId: entry.id,
        authorId: currentUid,
        text: draft.text,
        stamp: draft.stamp,
        replyToId: draft.replyToId,
      });
      setText("");
      setReplyTo(null);
    } catch {
      fail();
    } finally {
      setSending(false);
    }
  };

  const remove = async (comment: Comment): Promise<void> => {
    setError(null);
    try {
      await deleteComment(comment);
    } catch {
      celebrate("quake");
      setError("けせませんでした。もういちど おしてね");
    }
  };

  const renderComment = (comment: Comment, isReply: boolean): JSX.Element => {
    const author = memberById.get(comment.authorId);
    const parent = comment.replyToId ? byId.get(comment.replyToId) : undefined;
    const mayDelete = comment.authorId === currentUid || canModerate;
    return (
      <div key={comment.id} className={isReply ? "ml-8" : undefined}>
        {isReply ? (
          <p className="mb-0.5 text-xs text-muted">
            → {parent ? nameOf(parent.authorId) : "だれか"} へ
          </p>
        ) : null}
        <div className="flex items-start gap-2">
          {author ? (
            <Avatar info={author.info} size="sm" />
          ) : (
            <span className="avatar h-8 w-8 text-base" aria-hidden="true">
              👤
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-muted">
              {nameOf(comment.authorId)}
            </p>
            {comment.stamp ? (
              <p className="text-2xl leading-snug" aria-hidden="true">
                {comment.stamp}
              </p>
            ) : null}
            {comment.text ? (
              <p className="whitespace-pre-wrap text-[15px] text-ink">
                {comment.text}
              </p>
            ) : null}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setReplyTo(comment)}
                className="min-h-tap rounded-card px-2 text-xs font-bold text-self active:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self"
              >
                へんしん
              </button>
              {mayDelete ? (
                <button
                  type="button"
                  onClick={() => void remove(comment)}
                  className="min-h-tap rounded-card px-2 text-xs font-bold text-muted active:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self"
                >
                  けす
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {comments.loading ? (
        <div className="grid place-items-center py-6">
          <Spinner />
        </div>
      ) : comments.error ? (
        <Badge tone="late">コメントが よみこめませんでした</Badge>
      ) : count === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          まだ コメントは ありません。ほめてあげよう！
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {roots.map((root) => (
            <div key={root.id} className="flex flex-col gap-3">
              {renderComment(root, false)}
              {repliesUnder(root.id).map((reply) => renderComment(reply, true))}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {error ? <Badge tone="late">{error}</Badge> : null}

      <div className="flex flex-col gap-2">
        {replyTo ? (
          <span className="inline-flex items-center gap-1 self-start rounded-pill border border-self/40 bg-self/15 px-3 py-1 text-xs font-bold text-self">
            {nameOf(replyTo.authorId)} へ へんしんちゅう
            <button
              type="button"
              aria-label="へんしんを やめる"
              onClick={() => setReplyTo(null)}
              className="grid h-6 w-6 place-items-center rounded-pill active:bg-self/20"
            >
              ✕
            </button>
          </span>
        ) : null}

        <div className="flex flex-wrap gap-1">
          {STAMPS.map((stamp) => (
            <button
              key={stamp.stamp ?? stamp.text}
              type="button"
              disabled={sending}
              onClick={() =>
                void send({
                  text: stamp.text,
                  stamp: stamp.stamp,
                  replyToId: replyTo?.id,
                })
              }
              className="min-h-tap rounded-pill border border-rule bg-panel px-3 text-sm font-bold text-ink transition-colors active:bg-sunk disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self"
            >
              {stamp.stamp ?? stamp.text}
            </button>
          ))}
        </div>

        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="コメントを かこう"
          aria-label="コメントを かく"
          rows={2}
        />
        <Button
          variant="primary"
          block
          disabled={sending || text.trim().length === 0}
          onClick={() =>
            void send({ text, replyToId: replyTo?.id })
          }
        >
          {sending ? <Spinner size="sm" /> : "おくる"}
        </Button>
      </div>
    </div>
  );
}
