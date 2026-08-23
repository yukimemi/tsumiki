import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import { EffectsProvider } from "./effects/EffectsProvider";
import { HouseholdProvider } from "./household/HouseholdProvider";
import { useHousehold } from "./household/context";
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

export default function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <HouseholdProvider>
          <EffectsProvider>
            <BrowserRouter>
              <HouseholdGate />
            </BrowserRouter>
          </EffectsProvider>
        </HouseholdProvider>
      </RequireAuth>
    </AuthProvider>
  );
}
