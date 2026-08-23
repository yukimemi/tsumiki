// Google sign-in only. One tap on a phone, no password to store, and the
// account already carries the verified email that the invite flow keys off.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { auth, firebaseConfigured, googleProvider } from "../lib/firebase";
import { claimEmailInvites } from "../data/invites";
import { syncUserDoc } from "../data/users";
import { AuthContext, type AuthState } from "./context";

/**
 * Popup is the nicer path, but iOS standalone PWAs and any page whose opener
 * relationship is cut cannot use it. These are the failures where a redirect
 * will work, so retrying that way is worth doing without telling the user.
 */
const REDIRECT_FALLBACK_CODES: Record<string, true> = {
  "auth/popup-blocked": true,
  "auth/popup-closed-by-user": true,
  "auth/cancelled-popup-request": true,
  "auth/web-storage-unsupported": true,
  "auth/operation-not-supported-in-this-environment": true,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);

  useEffect(() => {
    if (!firebaseConfigured) return;
    // Completes a redirect sign-in when the app reloads back into it. A no-op
    // on the popup path, but it has to run before we trust the auth state.
    void getRedirectResult(auth()).catch((e) =>
      console.warn("[auth] redirect result failed", e),
    );

    return onAuthStateChanged(auth(), (u) => {
      setUser(u);
      setLoading(false);
      if (!u) return;
      // Both are fire-and-forget: neither should hold the UI, and both are
      // idempotent, so the next sign-in retries anything that failed here.
      void syncUserDoc(u).catch((e) =>
        console.warn("[auth] user sync failed", e),
      );
      void claimEmailInvites(u).catch((e) =>
        console.warn("[auth] invite claim failed", e),
      );
    });
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      configured: firebaseConfigured,
      signIn: async () => {
        try {
          await signInWithPopup(auth(), googleProvider);
        } catch (e) {
          const code = (e as { code?: string }).code ?? "";
          if (!REDIRECT_FALLBACK_CODES[code]) throw e;
          await signInWithRedirect(auth(), googleProvider);
        }
      },
      signOutUser: async () => {
        await signOut(auth());
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
