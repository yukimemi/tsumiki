// @vitest-environment jsdom
//
// The focus-trap effect in Sheet has one job while a sheet is open: keep Tab
// inside it and hand focus back on close. It must not have a second, hidden
// job of re-grabbing focus every time the owning screen re-renders — that
// class of bug regresses silently because it only shows up once a caller's
// onClose is an inline closure and something inside the sheet has its own
// state (see CoinsScreen's coin-grant amount field).

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { Sheet } from "./ui";

afterEach(() => {
  document.body.innerHTML = "";
});

/**
 * `onClose={() => setOpen(false)}` is a fresh closure on every render, and
 * typing into the field re-renders this wrapper via its own `text` state —
 * exactly the shape every real caller (CoinsScreen, etc.) has.
 */
function Wrapper() {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="test">
      <input
        aria-label="amount"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </Sheet>
  );
}

describe("Sheet", () => {
  it("keeps focus on a field inside it across re-renders from typing", () => {
    render(<Wrapper />);
    const input = screen.getByLabelText("amount") as HTMLInputElement;

    act(() => {
      input.focus();
    });
    expect(document.activeElement).toBe(input);

    for (const char of "123") {
      fireEvent.change(input, { target: { value: input.value + char } });
      expect(document.activeElement).toBe(input);
    }

    expect(input.value).toBe("123");
  });
});
