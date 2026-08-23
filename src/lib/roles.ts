/**
 * Every permission question in the app goes through here, so the UI and
 * firestore.rules cannot drift apart in more than one place.
 */

import type { Household, MemberInfo, Role } from "../types";

export const ROLE_LABELS_JA: Record<Role, string> = {
  owner: "おや(かんりにん)",
  parent: "おや",
  child: "こども",
};

export function roleOf(household: Household | null, uid: string | null): Role | null {
  if (!household || !uid) return null;
  return household.memberRoles?.[uid] ?? null;
}

export function isOwner(household: Household | null, uid: string | null): boolean {
  return roleOf(household, uid) === "owner";
}

/** Owner is a parent with extras, never a separate branch at the call site. */
export function isParent(household: Household | null, uid: string | null): boolean {
  const role = roleOf(household, uid);
  return role === "owner" || role === "parent";
}

export function canManageTasks(household: Household | null, uid: string | null): boolean {
  return isParent(household, uid);
}

export function canApprove(household: Household | null, uid: string | null): boolean {
  return isParent(household, uid);
}

export function canManageMembers(household: Household | null, uid: string | null): boolean {
  return isParent(household, uid);
}

export function memberOf(household: Household | null, uid: string): MemberInfo | null {
  if (!household) return null;
  return household.memberInfo?.[uid] ?? null;
}

export function displayNameOf(household: Household | null, uid: string): string {
  return memberOf(household, uid)?.displayName || "だれか";
}
