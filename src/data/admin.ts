// The one client read that crosses household boundaries. Firestore rules
// only grant it to the addresses in `src/lib/admin.ts` / `firestore.rules`
// `isAdmin()`, and only for the `households` document itself — never
// `entries`, `comments`, or anything else a member wrote. `enabled` gates the
// query so a non-admin's client never even attempts it.

import { collection, query } from "firebase/firestore";

import { db } from "../lib/firebase";
import type { Household, Live } from "../types";
import { useLiveDocs } from "./live";

const COL = "households";

export function useAllHouseholdsForAdmin(enabled: boolean): Live<Household[]> {
  return useLiveDocs<Household>(
    enabled ? () => query(collection(db(), COL)) : null,
    (d) => ({ ...(d.data() as Omit<Household, "id">), id: d.id }),
    [enabled],
  );
}
