// Which family the app is currently looking at, plus everything derived from
// it that more than one screen needs. Kept apart from the provider for React
// Fast Refresh.

import { createContext, useContext } from "react";
import type { Household, MemberInfo, Role } from "../types";

export type HouseholdMember = { uid: string; role: Role; info: MemberInfo };

export type HouseholdState = {
  households: Household[];
  household: Household | null;
  householdId: string | null;
  /** Owner first, then parents, then children; each group by display name. */
  members: HouseholdMember[];
  role: Role | null;
  /** Owner counts as a parent: the role matrix nests. */
  isParent: boolean;
  isOwner: boolean;
  loading: boolean;
  select(id: string): void;
};

export const HouseholdContext = createContext<HouseholdState | undefined>(
  undefined,
);

export function useHousehold(): HouseholdState {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold must be used inside <HouseholdProvider>");
  return ctx;
}
