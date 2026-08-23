// Firestore rejects `undefined` outright, and an empty string is what an
// untouched optional form field produces. Both mean "not set" here, and both
// have to be gone before a payload leaves this layer. A field that should stop
// being set uses `deleteField()` at the call site instead — that is a
// different intent and it survives `clean` untouched.
//
// `0` and `false` are values, not absences: a task worth zero coins and an
// unarchived task both matter, so neither is dropped.

import { serverTimestamp } from "firebase/firestore";

export function clean<T extends Record<string, unknown>>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const key in value) {
    const v = value[key];
    if (v === undefined || v === "") continue;
    out[key] = v;
  }
  return out as Partial<T>;
}

/** For a document being created. */
export function forWrite<T extends Record<string, unknown>>(
  value: T,
): Record<string, unknown> {
  return {
    ...clean(value),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/** For a merge or update: `createdAt` belongs to whoever created the document. */
export function forMerge<T extends Record<string, unknown>>(
  value: T,
): Record<string, unknown> {
  return { ...clean(value), updatedAt: serverTimestamp() };
}
