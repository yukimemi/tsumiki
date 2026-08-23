// One subscription shape for the whole data layer, so every screen treats
// loading and failure the same way regardless of which collection it reads.
//
// Snapshots carrying `hasPendingWrites` are skipped on purpose. Writes here are
// multi-document batches: completing a task touches the entry, the ledger and
// the balance. The local echo arrives per document, so a screen reacting to it
// would render a finished task whose coins have not appeared yet. Waiting for
// the server round-trip keeps the pieces in step.

import { useEffect, useState } from "react";
import {
  onSnapshot,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import type { Live } from "../types";

/** Shared empty result. A stable identity keeps downstream `useMemo` honest. */
const NO_DOCS: never[] = [];

const LOADING_LIST: Live<never[]> = {
  data: NO_DOCS,
  loading: true,
  error: null,
};

const LOADING_DOC: Live<null> = { data: null, loading: true, error: null };

/**
 * Results are stamped with the key of the subscription that produced them.
 * When the key changes, the previous result is discarded during render, which
 * gets the reset-to-loading behaviour without a state update inside an effect.
 */
type Held<T> = { key: string; state: Live<T> };

/** `deps` must be primitives: they are the identity of the query. */
function keyOf(build: unknown, deps: unknown[]): string | null {
  return build === null ? null : deps.join("\u0000");
}

/**
 * Subscribe to a query. A null `build` means "not ready yet" — no signed-in
 * uid, no household selected — and holds the hook in its loading state rather
 * than inventing an empty result.
 *
 * `deps` decides when to resubscribe. `build` and `map` are read from the
 * render that last changed `deps`, which is exactly the render whose values
 * they close over.
 */
export function useLiveDocs<T>(
  build: (() => Query<DocumentData>) | null,
  map: (snap: QueryDocumentSnapshot<DocumentData>) => T,
  deps: unknown[],
): Live<T[]> {
  const key = keyOf(build, deps);
  const [held, setHeld] = useState<Held<T[]> | null>(null);

  useEffect(() => {
    if (!build || key === null) return;
    return onSnapshot(
      build(),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        setHeld({
          key,
          state: {
            data: snap.docs.map((d) => map(d)),
            loading: false,
            error: null,
          },
        });
      },
      (error) => setHeld({ key, state: { data: NO_DOCS, loading: false, error } }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return held !== null && held.key === key ? held.state : LOADING_LIST;
}

/**
 * Single-document counterpart. `map` returns null for a missing document, so
 * callers tell "not there" from "not loaded yet" through `loading`.
 */
export function useLiveDoc<T>(
  build: (() => DocumentReference<DocumentData>) | null,
  map: (snap: DocumentSnapshot<DocumentData>) => T | null,
  deps: unknown[],
): Live<T | null> {
  const key = keyOf(build, deps);
  const [held, setHeld] = useState<Held<T | null> | null>(null);

  useEffect(() => {
    if (!build || key === null) return;
    return onSnapshot(
      build(),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        setHeld({ key, state: { data: map(snap), loading: false, error: null } });
      },
      (error) => setHeld({ key, state: { data: null, loading: false, error } }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return held !== null && held.key === key ? held.state : LOADING_DOC;
}
