// Proof-of-task photos. One per completion, stored at a path derived from the
// entry id so an entry can only ever own one and a re-shoot overwrites it
// instead of accumulating orphans.
//
// The entry stores the Storage *path*, never a download URL: a URL carries a
// token that is reissued whenever the object is replaced, so a stored URL goes
// stale the first time a child retakes the photo.

import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { useEffect, useState } from "react";

import { shrinkImage } from "../lib/image";
import { storage } from "../lib/firebase";

/** Deterministic, so one completion cannot leave two photos behind. */
export function photoPathFor(householdId: string, entryId: string): string {
  return `households/${householdId}/entries/${entryId}/proof.jpg`;
}

/**
 * Downscale, upload, and hand back the path to store on the entry.
 *
 * The caller writes the path into Firestore. Doing it here would make this
 * module reach into two services for one action, and the entry write differs
 * between "completing with a photo" and "adding one afterwards".
 */
export async function uploadEntryPhoto(input: {
  householdId: string;
  entryId: string;
  file: File;
}): Promise<string> {
  const blob = await shrinkImage(input.file);
  const path = photoPathFor(input.householdId, input.entryId);
  await uploadBytes(ref(storage(), path), blob, {
    contentType: "image/jpeg",
    cacheControl: "public, max-age=31536000, immutable",
  });
  return path;
}

/** Undo takes the photo with it; a missing object is already the goal. */
export async function deleteEntryPhoto(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage(), path));
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code.includes("object-not-found")) return;
    throw error;
  }
}

/**
 * Resolve a Storage path to a URL the browser can show.
 *
 * Kept as a hook because every surface that renders a photo needs the same
 * async lookup, and the result is cacheable by the browser for a year thanks
 * to the upload's `cacheControl`.
 *
 * The result is stamped with the path that produced it and compared during
 * render, which is how a changed path clears the old URL without a setState
 * inside the effect. Same shape as `useLiveDocs`.
 */
export function usePhotoUrl(path: string | null | undefined): string | null {
  const [held, setHeld] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    let live = true;
    getDownloadURL(ref(storage(), path))
      .then((url) => {
        if (live) setHeld({ path, url });
      })
      .catch(() => {
        // A deleted or not-yet-visible object is not worth an error state:
        // the card simply shows no photo.
      });
    return () => {
      live = false;
    };
  }, [path]);

  return held !== null && held.path === path ? held.url : null;
}
