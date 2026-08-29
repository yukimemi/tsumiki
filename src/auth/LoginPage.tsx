// Sign-in screen. Deliberately plain: the design system owns the rest of the
// app's look, and this page only has one thing to do.

import { useState } from "react";
import { useAuth } from "./context";

export function LoginPage() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setBusy(true);
    setError(null);
    signIn()
      .catch(() => setError("サインインできませんでした。もういちどためしてください。"))
      .finally(() => setBusy(false));
  };

  return (
    <main
      className="flex min-h-full flex-col items-center justify-center gap-8 p-6"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <header className="flex flex-col items-center gap-3 text-center">
        <span aria-hidden="true" className="text-5xl">
          🧱
        </span>
        <h1 className="text-3xl font-bold tracking-tight">tsumiki</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          やることを積み上げて、コインをためよう。
        </p>
      </header>

      <section
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border p-6"
        style={{
          background: "var(--panel)",
          borderColor: "var(--rule)",
        }}
      >
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="w-full rounded-xl px-4 py-3 text-base font-semibold disabled:opacity-60"
          style={{ background: "var(--coin)", color: "var(--ink)" }}
        >
          {busy ? "サインインしています…" : "Google でつづける"}
        </button>

        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          はじめての人は、サインインしたあとに かぞくを つくれます。
          さそわれた人は、さそわれた メールアドレスで サインインしてください。
        </p>

        {error !== null && (
          <p role="alert" className="text-xs" style={{ color: "var(--self)" }}>
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
