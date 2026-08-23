import { useId, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";

import { ImageTooLargeError, NotAnImageError } from "../lib/image";
import { Badge, Spinner } from "./ui";

/**
 * A camera button that hands back one file.
 *
 * `capture="environment"` is what makes Android open the rear camera straight
 * away instead of the file browser — the child is standing in front of the
 * thing they just cleaned. iOS still offers the library as well, which is the
 * behaviour there and not worth fighting.
 *
 * The `<input>` is `sr-only` inside a `relative` label: see the note in
 * ui.tsx's SegmentedControl for why the positioned ancestor matters.
 */
export function PhotoButton(props: {
  label: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  onPick(file: File): void;
}): JSX.Element {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy = false, disabled = false } = props;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={inputId}
        className={[
          "relative inline-flex min-h-tap items-center justify-center gap-2 rounded-pill border-2 border-self px-4 text-sm font-bold text-self",
          "transition-colors active:bg-self/10",
          "focus-within:outline-none focus-within:ring-2 focus-within:ring-self focus-within:ring-offset-2 focus-within:ring-offset-paper",
          disabled || busy ? "pointer-events-none opacity-60" : "cursor-pointer",
        ].join(" ")}
      >
        {busy ? <Spinner size="sm" /> : <span aria-hidden="true">📷</span>}
        {props.label}
        <input
          id={inputId}
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={disabled || busy}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Let the same photo be chosen twice in a row: without this the
            // input holds the old value and fires nothing.
            event.target.value = "";
            if (!file) return;
            if (!file.type.startsWith("image/")) {
              setError(new NotAnImageError().message);
              return;
            }
            if (file.size > 25 * 1024 * 1024) {
              setError(new ImageTooLargeError().message);
              return;
            }
            setError(null);
            props.onPick(file);
          }}
        />
      </label>

      {error ? <Badge tone="late">{error}</Badge> : null}
    </div>
  );
}
