// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  applyTheme,
  bootTheme,
  loadMotion,
  loadTheme,
  saveMotion,
  saveTheme,
} from "./theme";

const THEME_KEY = "tsumiki.theme";
const MOTION_KEY = "tsumiki.motion";

/**
 * A working `localStorage`, installed rather than assumed.
 *
 * jsdom's own is shadowed here by Node's experimental `localStorage`
 * global, which is present but inert without `--localstorage-file`, so
 * the environment offers `"localStorage" in window` and `undefined` when
 * you read it. Persistence is the thing under test, so the test supplies
 * the storage instead of testing theme.ts's private-mode fallback by
 * accident.
 */
function installStorage(): Storage {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key) {
      return entries.get(key) ?? null;
    },
    key(index) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key) {
      entries.delete(key);
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });

  return storage;
}

let storage: Storage;

beforeEach(() => {
  storage = installStorage();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.motion;
});

describe("theme", () => {
  it("starts on hiru when nothing has been chosen", () => {
    expect(loadTheme()).toBe("hiru");
  });

  it("remembers a chosen theme", () => {
    saveTheme("yoru");

    expect(storage.getItem(THEME_KEY)).toBe("yoru");
    expect(loadTheme()).toBe("yoru");
  });

  it("ignores a stored value that is not a theme", () => {
    // A renamed or removed theme must not reach <html>, where it would
    // match no palette block and leave the app on the bare slots.
    storage.setItem(THEME_KEY, "neon");

    expect(loadTheme()).toBe("hiru");

    bootTheme();
    expect(document.documentElement.dataset.theme).toBe("hiru");
  });

  it("applyTheme writes the theme onto the document element", () => {
    applyTheme("matsuri");

    expect(document.documentElement.dataset.theme).toBe("matsuri");
  });

  it("saveMotion writes the motion axis onto the document element", () => {
    saveMotion("calm");

    expect(document.documentElement.dataset.motion).toBe("calm");
    expect(storage.getItem(MOTION_KEY)).toBe("calm");
    expect(loadMotion()).toBe("calm");
  });

  it("bootTheme applies both axes", () => {
    storage.setItem(THEME_KEY, "yoru");
    storage.setItem(MOTION_KEY, "calm");

    bootTheme();

    expect(document.documentElement.dataset.theme).toBe("yoru");
    expect(document.documentElement.dataset.motion).toBe("calm");
  });
});
