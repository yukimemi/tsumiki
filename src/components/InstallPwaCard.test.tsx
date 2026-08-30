// @vitest-environment jsdom
//
// This card exists to nudge a phone user who is not yet installed -- it
// must stay silent everywhere else (desktop, or already standalone), and
// on Android it must not offer a button that has nothing to prompt.
//
// The install prompt is captured at module scope in `pwaInstall.ts` (see
// that file for why), so these tests dispatch `beforeinstallprompt` on
// `window` directly rather than mocking the module -- that's the only way
// to exercise the real capture -> `useSyncExternalStore` -> button path.

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { clearInstallPrompt } from "../lib/pwaInstall";
import { InstallPwaCard } from "./InstallPwaCard";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36";
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

function mockUserAgent(ua: string): void {
  vi.stubGlobal("navigator", { ...navigator, userAgent: ua });
}

function mockStandalone(standalone: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query === "(display-mode: standalone)",
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/** A `beforeinstallprompt`-shaped event jsdom has no native class for. */
function dispatchBeforeInstallPrompt(userChoice: {
  outcome: "accepted" | "dismissed";
}): { prompt: Mock<(...args: unknown[]) => Promise<void>> } {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve(userChoice) });
  fireEvent(window, event);
  return { prompt };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  // The prompt is captured at module scope; each test that dispatches
  // `beforeinstallprompt` must not leak it into the next one.
  clearInstallPrompt();
});

describe("InstallPwaCard", () => {
  it("renders nothing on desktop even after a prompt is captured", () => {
    mockUserAgent(DESKTOP_UA);
    mockStandalone(false);
    dispatchBeforeInstallPrompt({ outcome: "accepted" });
    render(<InstallPwaCard />);
    expect(document.body.textContent).toBe("");
  });

  it("renders nothing when already running standalone", () => {
    mockUserAgent(ANDROID_UA);
    mockStandalone(true);
    dispatchBeforeInstallPrompt({ outcome: "accepted" });
    render(<InstallPwaCard />);
    expect(document.body.textContent).toBe("");
  });

  it("renders nothing on Android before beforeinstallprompt has fired", () => {
    // No prompt captured yet means there is nothing a tap could do.
    mockUserAgent(ANDROID_UA);
    mockStandalone(false);
    render(<InstallPwaCard />);
    expect(document.body.textContent).toBe("");
  });

  it("shows manual instructions on iOS Safari, with no install button", () => {
    mockUserAgent(IOS_UA);
    mockStandalone(false);
    render(<InstallPwaCard />);
    expect(screen.getByText(/ホーム画面に追加/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows an install button on Android once beforeinstallprompt fires, even captured before mount, and triggers it on tap", async () => {
    mockUserAgent(ANDROID_UA);
    mockStandalone(false);
    // Fired before render, mirroring the real one-shot timing this
    // component must survive: capture happens at module scope, not in an
    // effect tied to this component's lifetime.
    const { prompt } = dispatchBeforeInstallPrompt({ outcome: "accepted" });

    render(<InstallPwaCard />);
    const button = screen.getByRole("button", { name: "ホーム画面に ついか" });
    fireEvent.click(button);

    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    // The captured event is single-use; after triggering it the button
    // (and the whole card, once nothing else applies) must disappear.
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "ホーム画面に ついか" }),
      ).toBeNull(),
    );
  });
});
