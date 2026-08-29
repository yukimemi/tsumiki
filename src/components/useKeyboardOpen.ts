import { useEffect, useState } from "react";

/** Inputs that open a software keyboard. A radio or a checkbox does not. */
const TEXTUAL_INPUT: Record<string, true> = {
  text: true,
  search: true,
  email: true,
  url: true,
  tel: true,
  number: true,
  password: true,
  time: true,
  date: true,
};

function isTextual(node: Element | null): boolean {
  if (node instanceof HTMLTextAreaElement) return true;
  if (node instanceof HTMLInputElement) return TEXTUAL_INPUT[node.type] === true;
  return false;
}

/**
 * How much of the visual viewport the keyboard has to swallow before we
 * believe it. Browser chrome sliding in and out moves this by a little; a
 * software keyboard takes a third of the screen or more.
 */
const KEYBOARD_MIN_RATIO = 0.25;

/**
 * How long a fresh mount ignores viewport/focus events before trusting
 * them. Covers the OS chrome settling into standalone display mode on a
 * cold PWA launch; short enough that a real keyboard opened by the user
 * can't land inside it.
 */
const KEYBOARD_SETTLE_MS = 600;

/**
 * True while the software keyboard is actually covering the screen.
 *
 * This asks the visual viewport rather than asking who has focus, and that
 * distinction is the whole point. Focus is a latch: dismissing the keyboard
 * with Android's back gesture leaves the field focused, so a focus-driven
 * check stays true after the keyboard is gone and the five tabs never come
 * back — which is exactly how the nav went missing in the installed PWA.
 * Viewport height is not a latch. It reports what is on screen right now,
 * and every route back to a full-height viewport fires `resize`.
 *
 * It also fails in the safe direction: no `visualViewport`, no hiding.
 *
 * A second failure mode, cold-launch only: a freshly opened standalone PWA
 * can fire a `resize` before the OS chrome finishes settling, reporting a
 * viewport shorter than `window.innerHeight` for a frame or two with
 * nothing focused — the nav vanished on the very first open and only came
 * back once reopened. A short settle window after mount ignores that.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    // A freshly launched standalone PWA can fire its first `resize` while
    // the OS status/gesture bars are still animating into place, before the
    // visual and layout viewports agree — a false "covered" reading with
    // nothing focused. Nothing in the app can have a real keyboard open in
    // this window, since it fires before a person has touched anything, so
    // the nav is held visible until the viewport has had a moment to settle.
    let settled = false;
    const settle = window.setTimeout(() => {
      settled = true;
    }, KEYBOARD_SETTLE_MS);

    const sync = () => {
      if (!settled) return;
      const hidden = window.innerHeight - viewport.height;
      const covered = hidden > window.innerHeight * KEYBOARD_MIN_RATIO;
      // A shrunken viewport with nothing focused is a browser-UI artefact,
      // not a keyboard, so both have to agree before the nav stands down.
      setOpen(covered && isTextual(document.activeElement));
    };

    viewport.addEventListener("resize", sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    return () => {
      window.clearTimeout(settle);
      viewport.removeEventListener("resize", sync);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
    };
  }, []);

  return open;
}

