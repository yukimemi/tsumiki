import { useEffect, useId, useRef } from "react";
import type {
  ComponentPropsWithRef,
  CSSProperties,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { MemberInfo } from "../types";

/**
 * The kit. Every primitive the screens are allowed to build from.
 *
 * Two rules run through all of it. Colour is never written here — only
 * the slot names from src/index.css, by way of the Tailwind palette, so
 * three themes cost zero `dark:` prefixes. And nothing a finger has to
 * hit is shorter than `var(--tap)`: this is a phone app used by children,
 * where a 32px row is a mis-tap and a mis-tap is a coin.
 */

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/** Semantic colouring, restricted to the slots that carry meaning. */
export type Tone = "neutral" | "coin" | "done" | "wait" | "late" | "self";

const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-sunk text-ink border-rule",
  coin: "bg-coin/15 text-ink border-coin/40",
  done: "bg-done/15 text-done border-done/40",
  wait: "bg-wait/15 text-wait border-wait/40",
  late: "bg-late/15 text-late border-late/40",
  self: "bg-self/15 text-self border-self/40",
};

const TONE_SOLID: Record<Tone, string> = {
  neutral: "bg-rule-strong text-paper",
  coin: "bg-coin text-on-coin",
  done: "bg-done text-paper",
  wait: "bg-wait text-paper",
  late: "bg-late text-paper",
  self: "bg-self text-paper",
};

function classes(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---- Button -------------------------------------------------------- */

export type ButtonVariant = "primary" | "coin" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container — the default shape for a sheet's action. */
  block?: boolean;
};

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-self text-paper shadow-glow-self",
  coin: "bg-coin text-on-coin shadow-glow-coin",
  ghost: "bg-panel text-ink border border-rule active:bg-sunk",
  danger: "bg-late text-paper shadow-glow-late",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: "min-h-tap px-4 text-[15px]",
  lg: "min-h-[52px] px-5 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classes(
        "inline-flex items-center justify-center gap-2 rounded-card font-bold transition-colors",
        "active:brightness-95 disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        block && "w-full",
        FOCUS_RING,
        className,
      )}
      {...rest}
    />
  );
}

/* ---- IconButton ---------------------------------------------------- */

export type IconButtonProps = ComponentPropsWithRef<"button"> & {
  /** Required: an icon button has no text to read out. */
  label: string;
  tone?: Tone;
};

export function IconButton({
  label,
  tone = "neutral",
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={classes(
        "inline-grid h-tap w-tap place-items-center rounded-pill text-lg transition-colors",
        "active:brightness-95 disabled:pointer-events-none disabled:opacity-50",
        tone === "neutral" ? "text-ink active:bg-sunk" : `${TONE_SOFT[tone]} border`,
        FOCUS_RING,
        className,
      )}
      {...rest}
    />
  );
}

/* ---- Card ---------------------------------------------------------- */

export type CardProps = ComponentPropsWithRef<"div"> & {
  padded?: boolean;
};

export function Card({ padded = true, className, ...rest }: CardProps) {
  return (
    <div
      className={classes("card", padded && "p-4", className)}
      {...rest}
    />
  );
}

/* ---- Sheet --------------------------------------------------------- */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export type SheetProps = {
  open: boolean;
  onClose(): void;
  title?: ReactNode;
  children?: ReactNode;
  /** Pinned under the scrolling body, above the safe-area inset. */
  footer?: ReactNode;
};

/**
 * A bottom sheet, which on a phone is what a dialog is.
 *
 * Closes on Escape and on a tap outside, keeps Tab inside itself while it
 * is up, locks the page behind it, and gives focus back to whatever
 * opened it on the way out. The bottom padding carries the home-indicator
 * inset so the last button is not underneath it.
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const opener = document.activeElement;
    const body = document.body;
    const restoreOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const node = panel.current;
      if (!node) return;

      const items = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !node.contains(active);

      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // The panel, not its first control: a sheet that opens with the
    // software keyboard already up hides half of itself.
    panel.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = restoreOverflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <div
        className="sheet-backdrop animate-fade-in-up"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className="sheet-panel animate-sheet-slide-up relative flex max-h-[88dvh] w-full max-w-md flex-col outline-none"
      >
        <div className="flex items-center gap-2 px-4 pt-3">
          <div className="sheet-grip mx-auto" aria-hidden="true" />
        </div>

        <div className="flex items-start gap-2 px-4 pb-2 pt-2">
          {title ? (
            <h2 id={titleId} className="flex-1 text-lg font-bold text-ink">
              {title}
            </h2>
          ) : (
            <div className="flex-1" />
          )}
          <IconButton label="とじる" onClick={onClose}>
            ✕
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {children}
        </div>

        {footer ? (
          <div className="border-t border-rule px-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        ) : (
          <div className="pb-[env(safe-area-inset-bottom)]" />
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ---- ConfirmDialog ------------------------------------------------- */

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "normal" | "danger";
  busy?: boolean;
  onConfirm(): void;
  onClose(): void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "はい",
  cancelLabel = "やめる",
  tone = "normal",
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" block onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            block
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Spinner size="sm" /> : confirmLabel}
          </Button>
        </div>
      }
    >
      {message ? (
        <p className="text-[15px] leading-relaxed text-muted">{message}</p>
      ) : null}
    </Sheet>
  );
}

/* ---- Field / Input / Textarea / Select ------------------------------ */

export type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /**
   * Wrap in a div instead of a label. A <label> around a radio or
   * checkbox group steals the click for whichever control is first.
   */
  group?: boolean;
  children: ReactNode;
};

export function Field({ label, hint, error, group, children }: FieldProps) {
  const body = (
    <>
      <span className="mb-1 block text-sm font-bold text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-sm text-late">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-sm text-muted">{hint}</span>
      ) : null}
    </>
  );

  return group ? (
    <div className="block">{body}</div>
  ) : (
    <label className="block">{body}</label>
  );
}

export type InputProps = ComponentPropsWithRef<"input">;

export function Input({ className, ...rest }: InputProps) {
  return <input className={classes("input", className)} {...rest} />;
}

export type TextareaProps = ComponentPropsWithRef<"textarea">;

export function Textarea({ className, rows = 3, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={classes("input resize-y", className)}
      {...rest}
    />
  );
}

export type SelectProps = ComponentPropsWithRef<"select">;

export function Select({ className, ...rest }: SelectProps) {
  return <select className={classes("input pr-8", className)} {...rest} />;
}

/* ---- Toggle -------------------------------------------------------- */

export type ToggleProps = {
  checked: boolean;
  onChange(next: boolean): void;
  label?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
};

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={classes(
        "flex min-h-tap w-full items-center gap-3 rounded-card px-1 text-left",
        "disabled:pointer-events-none disabled:opacity-50",
        FOCUS_RING,
      )}
    >
      <span className="min-w-0 flex-1">
        {label ? (
          <span className="block text-[15px] font-bold text-ink">{label}</span>
        ) : null}
        {hint ? (
          <span className="block text-sm text-muted">{hint}</span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={classes(
          "relative h-7 w-12 flex-none rounded-pill border transition-colors",
          checked
            ? "border-self/50 bg-self shadow-glow-self"
            : "border-rule bg-sunk",
        )}
      >
        <span
          className={classes(
            "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-pill bg-panel transition-all",
            checked ? "left-6" : "left-1",
          )}
        />
      </span>
    </button>
  );
}

/* ---- Chip / Badge -------------------------------------------------- */

export type ChipProps = {
  tone?: Tone;
  selected?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
};

export function Chip({
  tone = "neutral",
  selected = false,
  children,
  onClick,
  className,
}: ChipProps) {
  const shape =
    "inline-flex items-center gap-1 rounded-pill border px-3 text-sm font-bold";
  const look = selected ? TONE_SOLID[tone] : TONE_SOFT[tone];

  if (!onClick) {
    return (
      <span className={classes(shape, "py-1", look, className)}>
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={classes(
        shape,
        "min-h-tap transition-colors active:brightness-95",
        look,
        FOCUS_RING,
        className,
      )}
    >
      {children}
    </button>
  );
}

export type BadgeProps = {
  tone?: Tone;
  children: ReactNode;
  className?: string;
};

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={classes(
        "inline-flex min-w-[1.25rem] items-center justify-center rounded-pill px-1.5 py-0.5 text-xs font-bold tabular-nums",
        TONE_SOLID[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---- Avatar -------------------------------------------------------- */

export type AvatarSize = "sm" | "md" | "lg";

export type AvatarProps = {
  info: MemberInfo;
  size?: AvatarSize;
  className?: string;
};

const AVATAR_SIZE: Record<AvatarSize, string> = {
  sm: "h-8 w-8 text-base",
  md: "h-10 w-10 text-lg",
  lg: "h-14 w-14 text-2xl",
};

export function Avatar({ info, size = "md", className }: AvatarProps) {
  return (
    <span
      className={classes("avatar", AVATAR_SIZE[size], className)}
      // The member's own hue, lifted into the one slot .avatar reads.
      style={{ "--tone": `var(--m-${info.color})` } as CSSProperties}
    >
      {info.photoURL ? (
        <img
          src={info.photoURL}
          alt={info.displayName}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{info.emoji}</span>
      )}
    </span>
  );
}

/* ---- Spinner / Skeleton -------------------------------------------- */

export type SpinnerProps = {
  size?: "sm" | "md";
  className?: string;
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  const box = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  return (
    <svg
      viewBox="0 0 24 24"
      role="status"
      aria-label="よみこみちゅう"
      className={classes("animate-spin", box, className)}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        strokeWidth="3"
        className="stroke-rule"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-self"
      />
    </svg>
  );
}

export type SkeletonProps = {
  /** How many bars. One per row of the list being waited for. */
  rows?: number;
  className?: string;
};

export function Skeleton({ rows = 3, className }: SkeletonProps) {
  return (
    <div className={classes("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-card bg-sunk" />
      ))}
    </div>
  );
}

/* ---- EmptyState ---------------------------------------------------- */

export type EmptyStateProps = {
  title: string;
  hint?: string;
  emoji?: string;
  action?: ReactNode;
};

export function EmptyState({
  title,
  hint,
  emoji = "🧸",
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="text-4xl" aria-hidden="true">
        {emoji}
      </span>
      <p className="text-base font-bold text-ink">{title}</p>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ---- CoinAmount ---------------------------------------------------- */

export type CoinAmountProps = {
  coins: number;
  /** Shown underneath when the household's rate is known. */
  yen?: number;
  size?: "sm" | "md" | "lg";
  /** Ledger deltas want the sign; a balance does not. */
  signed?: boolean;
  className?: string;
};

const COIN_SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
};

/**
 * Gold as the tint and the glyph, never as the figure.
 *
 * --coin over --panel is a two-to-one contrast ratio in daylight, which
 * is fine for a shape and not fine for a number a child has to read. The
 * pill keeps the meaning, --ink keeps it legible.
 */
export function CoinAmount({
  coins,
  yen,
  size = "md",
  signed = false,
  className,
}: CoinAmountProps) {
  const sign = signed && coins > 0 ? "+" : "";
  return (
    <span className={classes("inline-flex flex-col items-end", className)}>
      <span
        className={classes(
          "inline-flex items-center gap-1 rounded-pill border border-coin/40 bg-coin/15 px-2 py-0.5 font-bold text-ink",
          COIN_SIZE[size],
        )}
      >
        <span aria-hidden="true">🪙</span>
        <span className="tabular-nums">
          {sign}
          {coins}
        </span>
      </span>
      {yen === undefined ? null : (
        <span className="mt-0.5 text-xs tabular-nums text-muted">
          およそ {yen}円
        </span>
      )}
    </span>
  );
}

/* ---- ProgressRing -------------------------------------------------- */

export type ProgressRingProps = {
  value: number;
  max: number;
  /** Outer diameter in pixels. */
  size?: number;
  label?: ReactNode;
  className?: string;
};

export function ProgressRing({
  value,
  max,
  size = 56,
  label,
  className,
}: ProgressRingProps) {
  const done = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const radius = 20;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      className={classes("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${value} / ${max} できた`}
    >
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-rule"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - done)}
          className="stroke-done transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span className="absolute text-xs font-bold tabular-nums text-ink">
        {label ?? `${value}/${max}`}
      </span>
    </span>
  );
}

/* ---- SegmentedControl ---------------------------------------------- */

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
};

export type SegmentedControlProps<T extends string> = {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange(next: T): void;
  /** Read out for the group. */
  label: string;
  /** Shared radio name; generated when omitted. */
  name?: string;
  className?: string;
};

/**
 * Real radios under the paint.
 *
 * Buttons with role="radio" would mean re-implementing arrow-key
 * movement and the roving tabindex; hiding actual inputs gets both from
 * the platform, and keeps the control usable inside an uncontrolled form.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  name,
  className,
}: SegmentedControlProps<T>) {
  const generated = useId();
  const group = name ?? generated;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={classes(
        "inline-flex gap-1 rounded-pill border border-rule bg-sunk p-1",
        className,
      )}
    >
      {options.map((option) => (
        // `relative` is load-bearing, not cosmetic. `sr-only` positions the
        // real radio absolutely; without a positioned ancestor it resolves
        // against the initial containing block, lands at its static offset
        // far down the document, and stretches the page to reach it. The
        // browser then scrolls the *document* to focus it, dragging the whole
        // app shell — bottom nav included — off screen.
        <label key={option.value} className="relative flex-1">
          <input
            type="radio"
            name={group}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className="peer sr-only"
          />
          <span
            className={classes(
              "flex min-h-tap items-center justify-center whitespace-nowrap rounded-pill px-3 text-sm font-bold transition-colors",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-self peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-sunk",
              option.value === value
                ? "bg-panel text-ink shadow-card"
                : "text-muted",
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
