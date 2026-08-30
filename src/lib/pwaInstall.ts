// Whether the app should offer its own "install as a PWA" affordance.
//
// The browser's own install UI (Chrome's omnibox icon, Safari's share sheet)
// already exists, but a parent on a phone rarely notices it. This module
// answers two independent questions a component needs to decide whether to
// show a button of its own:
//   - is this a phone-sized touch device, where "install" is worth asking
// for at all (a desktop user already has bookmarks/tabs)?
//   - is the app already running installed (standalone display mode), in
// which case asking again is noise?
//
// `beforeinstallprompt` fires at most once per page load, often within a
// second or two of the app becoming installable -- well before a user has
// navigated to Settings, where the only consumer (`InstallPwaCard`) lives.
// A listener attached inside that component's effect would miss it. The
// capture below is module-scope instead, so it runs the moment this module
// is first evaluated (today that's app boot -- the build has no route-level
// code splitting), independent of whether anything has mounted yet.

/** Chrome/Android's install prompt event. Not in lib.dom.d.ts. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let capturedPrompt: BeforeInstallPromptEvent | null = null;
let sawAppInstalled = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress Chrome's own mini-infobar; the captured event is replayed
    // later from whichever UI (currently only the Settings card) offers it.
    event.preventDefault();
    capturedPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    sawAppInstalled = true;
    capturedPrompt = null;
    notify();
  });
}

/** The captured install prompt, if one has fired and not yet been used. */
export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return capturedPrompt;
}

/** Subscribe to changes in the captured prompt / installed state. Returns
 * an unsubscribe function, matching `useSyncExternalStore`'s contract. */
export function subscribeInstallPrompt(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Drop the captured prompt after it has been shown once -- Chrome only
 * lets a given prompt be triggered a single time. */
export function clearInstallPrompt(): void {
  capturedPrompt = null;
  notify();
}

/** True if the `appinstalled` event has fired this session. */
export function wasJustInstalled(): boolean {
  return sawAppInstalled;
}

/** Rough phone/tablet check. Good enough for "worth asking to install" -- a
 * false positive just shows an extra card, a false negative just hides it. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** True once the app is already running as an installed PWA, on any
 * platform that exposes it. iOS Safari has no `display-mode` media query
 * support pre-install, so it reports through `navigator.standalone`
 * instead -- both checks are needed, neither alone covers every browser. */
export function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mediaStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;
  return mediaStandalone || iosStandalone;
}

/** iOS Safari never fires `beforeinstallprompt` -- there is no programmatic
 * install, only the manual "share -> add to home screen" flow, so the UI
 * needs to know which instructions to show. */
export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
