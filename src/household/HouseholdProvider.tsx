// One live subscription to the households this user belongs to, and one place
// that decides which of them is "current". Everything below reads roles from
// here instead of re-deriving them, so a permission check cannot drift between
// two screens.
//
// Belonging to nothing is a real state, not a loading state: `household` is
// null with `loading` false, which is the router's cue to show onboarding.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/context";
import { useHouseholds } from "../data/households";
import { isOwner, isParent, roleOf } from "../lib/roles";
import { MEMBER_COLORS, type Household, type MemberInfo, type Role } from "../types";
import {
  HouseholdContext,
  type HouseholdMember,
  type HouseholdState,
} from "./context";

const STORAGE_KEY = "tsumiki.household";

const ROLE_ORDER: Record<Role, number> = { owner: 0, parent: 1, child: 2 };

/** Japanese needs a collator: code-point order puts かな after 漢字. */
const NAME_ORDER = new Intl.Collator("ja");

const NO_MEMBERS: HouseholdMember[] = [];

/**
 * A uid listed in `memberIds` with no `memberInfo` entry — added by a script,
 * or by a claim that failed halfway. Showing a placeholder beats dropping the
 * member out of the family list.
 */
const UNKNOWN_MEMBER: MemberInfo = {
  displayName: "なまえ未設定",
  color: MEMBER_COLORS[0],
  emoji: "🧱",
};

/**
 * Storage is best effort. Reading it can throw outright — Safari in private
 * mode, a test running under plain Node — and an import-time crash there would
 * take the whole app down for a preference. Losing the preference will not.
 */
function savedSelection(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function buildMembers(household: Household): HouseholdMember[] {
  return household.memberIds
    .map((uid) => ({
      uid,
      role: household.memberRoles?.[uid] ?? "child",
      info: household.memberInfo?.[uid] ?? UNKNOWN_MEMBER,
    }))
    .sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        NAME_ORDER.compare(a.info.displayName, b.info.displayName),
    );
}

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const live = useHouseholds(uid);
  const [selected, setSelected] = useState<string | null>(savedSelection);

  const select = useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Selection still works this session; it just will not survive a reload.
    }
  }, []);

  const value = useMemo<HouseholdState>(() => {
    const households = live.data;
    // A stale saved id (household deleted, or membership removed) falls back to
    // the first one rather than showing an empty app.
    const household: Household | null =
      households.find((h) => h.id === selected) ?? households[0] ?? null;
    return {
      households,
      household,
      householdId: household === null ? null : household.id,
      members: household === null ? NO_MEMBERS : buildMembers(household),
      role: roleOf(household, uid),
      isParent: isParent(household, uid),
      isOwner: isOwner(household, uid),
      loading: uid !== null && live.loading,
      select,
    };
  }, [live, selected, uid, select]);

  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  );
}
