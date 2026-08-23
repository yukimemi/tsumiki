/**
 * Theme and motion, kept as two separate axes.
 *
 * Colour is one axis with three values — a light one, a dark one, and the
 * dark one with the lights up — because "dark mode" and "party mode" as
 * independent toggles produce a combination nobody designed. How loud the
 * celebrations are is the other axis, and it is genuinely independent: a
 * child who wants the night palette without the confetti is a real
 * request, and so is the reverse.
 *
 * Both are written onto `<html>` as data attributes and read back out of
 * CSS. Nothing here knows a colour value; the stylesheet owns those, and
 * `applyTheme` asks it for the resolved `--paper` when it has to tell the
 * browser chrome what colour the page is.
 */

export type Theme = "hiru" | "yoru" | "matsuri";
export type Motion = "full" | "calm";

export const THEMES: readonly { id: Theme; label: string; hint: string }[] = [
  { id: "hiru", label: "ひる", hint: "あかるい ひるのいろ" },
  { id: "yoru", label: "よる", hint: "くらい よるのいろ" },
  { id: "matsuri", label: "まつり", hint: "よるのいろ ＋ えんしゅつ ぜんぶ" },
];

const THEME_KEY = "tsumiki.theme";
const MOTION_KEY = "tsumiki.motion";

const DEFAULT_THEME: Theme = "hiru";

function isTheme(value: string | null): value is Theme {
  return value === "hiru" || value === "yoru" || value === "matsuri";
}

function isMotion(value: string | null): value is Motion {
  return value === "full" || value === "calm";
}

/**
 * Storage access, wrapped.
 *
 * `localStorage` throws rather than returning null in Safari's private
 * mode and when a site's data is blocked, and it is missing outright
 * during a server render. Either would happen inside `bootTheme`, which
 * runs before React does — so a broken read has to cost the default
 * theme and nothing else.
 */
function readKey(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch {
    // A theme that cannot be remembered is still a theme that works.
  }
}

export function prefersReducedMotion(): boolean {
  try {
    if (typeof matchMedia !== "function") return false;
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function loadTheme(): Theme {
  const stored = readKey(THEME_KEY);
  return isTheme(stored) ? stored : DEFAULT_THEME;
}

/**
 * The saved motion axis, or what the operating system already asked for.
 *
 * The stylesheet honours `prefers-reduced-motion` on its own, so this is
 * not what makes the app calm. It is what makes the settings screen agree
 * with the app instead of showing "full" over a still picture.
 */
export function loadMotion(): Motion {
  const stored = readKey(MOTION_KEY);
  if (isMotion(stored)) return stored;
  return prefersReducedMotion() ? "calm" : "full";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;

  // The address bar and the status bar are part of the page as far as a
  // standalone PWA is concerned, so they follow --paper rather than a
  // second copy of the palette in the manifest.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const paper = getComputedStyle(root).getPropertyValue("--paper").trim();
  if (paper) meta.setAttribute("content", paper);
}

export function applyMotion(motion: Motion): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.motion = motion;
}

export function saveTheme(theme: Theme): void {
  writeKey(THEME_KEY, theme);
  applyTheme(theme);
}

export function saveMotion(motion: Motion): void {
  writeKey(MOTION_KEY, motion);
  applyMotion(motion);
}

/**
 * Called from main.tsx before `createRoot`, so the first paint is already
 * the right theme. Doing this inside a React effect instead costs one
 * frame of the wrong palette on every cold start.
 */
export function bootTheme(): void {
  applyTheme(loadTheme());
  applyMotion(loadMotion());
}
