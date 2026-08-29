// Sits above HouseholdProvider: acceptance is a property of the account, not
// of any one household, and it must block a brand-new sign-up before
// OnboardingScreen the same way it blocks an existing member after a terms
// version bump — neither has a household yet or needs one to see this.

import type { JSX, ReactNode } from "react";

import { Spinner } from "../components/ui";
import { acceptTerms, useUserDoc } from "../data/users";
import { CURRENT_TERMS_VERSION } from "../lib/terms";
import { TermsScreen } from "../screens/TermsScreen";
import { useUid } from "./context";

export function TermsGate({ children }: { children: ReactNode }): JSX.Element {
  const uid = useUid();
  const userDoc = useUserDoc(uid);

  if (userDoc.loading) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <Spinner />
      </main>
    );
  }

  const accepted = userDoc.data?.termsVersion === CURRENT_TERMS_VERSION;
  if (!accepted) {
    return (
      <TermsScreen onAccept={() => acceptTerms(uid, CURRENT_TERMS_VERSION)} />
    );
  }

  return <>{children}</>;
}
