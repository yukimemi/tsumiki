// @vitest-environment jsdom
//
// Regression test for the cold-launch bug: a standalone PWA's first
// `visualViewport` resize can fire before the OS chrome settles, reporting
// a false "covered" reading with nothing focused. `useKeyboardOpen` ignores
// events for KEYBOARD_SETTLE_MS after mount to guard against exactly that,
// without masking a keyboard the user opens for real once settled.

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useKeyboardOpen } from "./useKeyboardOpen";

/** A minimal stand-in for `visualViewport`: just enough surface for the hook. */
class FakeVisualViewport extends EventTarget {
  height: number;

  constructor(height: number) {
    super();
    this.height = height;
  }

  resize(height: number) {
    this.height = height;
    this.dispatchEvent(new Event("resize"));
  }
}

function Probe() {
  const open = useKeyboardOpen();
  return <div data-testid="probe">{open ? "open" : "closed"}</div>;
}

/** A textual input, focused to drive `document.activeElement`. */
function focusInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  document.body.appendChild(input);
  input.focus();
  return input;
}

let viewport: FakeVisualViewport;

beforeEach(() => {
  vi.useFakeTimers();
  viewport = new FakeVisualViewport(800);
  vi.stubGlobal("visualViewport", viewport);
  Object.defineProperty(window, "innerHeight", {
    value: 800,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("useKeyboardOpen", () => {
  it("ignores a covered resize during the settle window right after mount", () => {
    render(<Probe />);
    const input = focusInput();

    act(() => {
      viewport.resize(400); // Covered and focused — would open if trusted.
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    expect(screen.getByTestId("probe").textContent).toBe("closed");
  });

  it("reacts normally to a real keyboard once settled", () => {
    render(<Probe />);
    const input = focusInput();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    act(() => {
      viewport.resize(400);
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    expect(screen.getByTestId("probe").textContent).toBe("open");
  });

  it("stays closed once settled if the viewport shrinks with nothing focused", () => {
    render(<Probe />);

    act(() => {
      vi.advanceTimersByTime(600);
    });

    act(() => {
      viewport.resize(400); // Browser-chrome artefact, no focused input.
    });

    expect(screen.getByTestId("probe").textContent).toBe("closed");
  });
});
