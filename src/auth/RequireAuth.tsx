// The auth gate. Everything below it can assume a signed-in user, which is
// what lets `useUid()` throw instead of returning null.

import type { ReactNode } from "react";
import { useAuth } from "./context";
import { LoginPage } from "./LoginPage";

function NotConfigured() {
  return (
    <main
      className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <h1 className="text-xl font-bold">せっていが たりません</h1>
      <p className="max-w-sm text-sm" style={{ color: "var(--muted)" }}>
        Firebase の設定が読み込めませんでした。
        <code className="mx-1">.env</code>に
        <code className="mx-1">VITE_FIREBASE_*</code>
        を設定してから、もういちど開いてください。
      </p>
    </main>
  );
}

function Booting() {
  return (
    <main
      className="flex min-h-full items-center justify-center p-6"
      style={{ background: "var(--paper)", color: "var(--muted)" }}
    >
      <p role="status" className="text-sm">
        よみこみちゅう…
      </p>
    </main>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { configured, loading, user } = useAuth();
  if (!configured) return <NotConfigured />;
  if (loading) return <Booting />;
  if (!user) return <LoginPage />;
  return <>{children}</>;
}
