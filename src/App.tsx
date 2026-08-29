import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { TermsGate } from "./auth/TermsGate";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import { EffectsProvider } from "./effects/EffectsProvider";
import { HouseholdProvider } from "./household/HouseholdProvider";
import { useHousehold } from "./household/context";
import { AboutScreen } from "./screens/AboutScreen";
import { AdminScreen } from "./screens/AdminScreen";
import { CoinsScreen } from "./screens/CoinsScreen";
import { FamilyScreen } from "./screens/FamilyScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { RecordsScreen } from "./screens/RecordsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TodayScreen } from "./screens/TodayScreen";

/**
 * Three gates, in order: signed in, then belongs to a family, then the tabs.
 *
 * The household gate sits above `AppShell` rather than inside it because the
 * shell's own header reads the household — name, your avatar, your balance —
 * so there is nothing for it to render until one exists.
 */
function HouseholdGate() {
  const { household, loading } = useHousehold();

  if (loading) {
    return (
      <main className="flex min-h-full items-center justify-center p-6">
        <Spinner />
      </main>
    );
  }

  if (!household) return <OnboardingScreen />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<TodayScreen />} />
        <Route path="/family" element={<FamilyScreen />} />
        <Route path="/coins" element={<CoinsScreen />} />
        <Route path="/records" element={<RecordsScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

/**
 * Cross-household, admin-only. Sits above the household gate: an admin
 * without their own family must still reach it, and it has nothing to do
 * with any one household's tabs. `AdminScreen` itself re-checks
 * `isAdminEmail` and renders a lock screen for anyone else — this route is
 * reachable by URL for a non-admin, only `firestore.rules` `isAdmin()`
 * (and the UI's own check) keep the data out of reach.
 */
function AdminGate() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminScreen />} />
      <Route path="*" element={<HouseholdGate />} />
    </Routes>
  );
}

/**
 * Everything that needs a signed-in user, mounted only once the router has
 * ruled out the public `/about` route. `AuthProvider` lives here rather than
 * at the top so a signed-out visitor on `/about` — including a crawler —
 * never touches Firebase at all.
 */
function AuthedApp() {
  return (
    <AuthProvider>
      <RequireAuth>
        <TermsGate>
          <HouseholdProvider>
            <EffectsProvider>
              <AdminGate />
            </EffectsProvider>
          </HouseholdProvider>
        </TermsGate>
      </RequireAuth>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/about" element={<AboutScreen />} />
        <Route path="/*" element={<AuthedApp />} />
      </Routes>
    </BrowserRouter>
  );
}
