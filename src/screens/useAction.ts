import { useCallback, useRef, useState } from "react";

import { useEffects } from "../effects/context";

/**
 * One write, guarded.
 *
 * Every screen does the same three things around a Firestore write: block the
 * control while it is in flight, turn a rejection into a short Japanese
 * sentence a child can read, and shake the shell so a failure is felt as well
 * as seen. Inline in six screens that drifts; here a permission error always
 * looks the same.
 *
 * `run` resolves true only when the write landed, so a caller can close its
 * sheet on success and keep it open on failure.
 */
export type Action = {
  busy: boolean;
  error: string | null;
  run(task: () => Promise<void>): Promise<boolean>;
  clear(): void;
};

/** Firestore's own messages are English and talk about rules. Ours do not. */
function messageOf(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  if (code.includes("permission-denied")) {
    return "これは できません。おうちのひとに きいてみてね";
  }
  if (code.includes("unavailable") || code.includes("network")) {
    return "つながりませんでした。もういちど ためしてね";
  }
  return "うまくいきませんでした。もういちど ためしてね";
}

export function useAction(): Action {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { celebrate } = useEffects();

  // A second tap while the first write is in flight must not start a second
  // write. State alone is a frame too slow for a fast double tap.
  const inFlight = useRef(false);

  const run = useCallback(
    async (task: () => Promise<void>): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        await task();
        return true;
      } catch (caught) {
        setError(messageOf(caught));
        celebrate("quake");
        return false;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [celebrate],
  );

  const clear = useCallback(() => setError(null), []);

  return { busy, error, run, clear };
}
