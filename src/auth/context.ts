// The auth context object and its hooks, kept apart from the provider so that
// module exports components only on one side and values only on the other —
// React Fast Refresh cannot reload a module that mixes them.

import { createContext, useContext } from "react";
import type { User } from "firebase/auth";

export type AuthState = {
  user: User | null;
  loading: boolean;
  /** False when the `VITE_FIREBASE_*` variables are missing. */
  configured: boolean;
  signIn(): Promise<void>;
  signOutUser(): Promise<void>;
};

export const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/**
 * For screens that already sit behind <RequireAuth>. Throwing here is better
 * than handing back an empty uid that would silently write to nobody.
 */
export function useUid(): string {
  const { user } = useAuth();
  if (!user) throw new Error("useUid requires an authenticated tree");
  return user.uid;
}
