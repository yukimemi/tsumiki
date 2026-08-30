// @vitest-environment jsdom
//
// The emoji field mixes a fixed palette with free text: this is the one
// place both must agree on which is "selected". A regression here would
// either lose a custom emoji the moment another field re-renders, or let
// the custom input silently disagree with a chip that looks selected.

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EffectsProvider } from "../effects/EffectsProvider";
import type { MemberInfo, Role } from "../types";
import { TaskEditor } from "./TaskEditor";

vi.mock("../data/tasks", () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));

const member: { uid: string; role: Role; info: MemberInfo } = {
  uid: "u1",
  role: "parent",
  info: { displayName: "おやこ", color: "sakura", emoji: "🧱" },
};

function renderEditor() {
  return render(
    <EffectsProvider>
      <TaskEditor
        open
        task={null}
        householdId="h1"
        actorUid="u1"
        members={[member]}
        coinYen={1}
        categories={[]}
        plan="free"
        taskCount={0}
        onClose={() => {}}
      />
    </EffectsProvider>,
  );
}

function customEmojiInput(): HTMLInputElement {
  return screen.getByLabelText("ほかの えもじを にゅうりょく") as HTMLInputElement;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TaskEditor emoji field", () => {
  it("selects a fixed emoji from the palette", () => {
    renderEditor();
    const chip = screen.getByText("💪").closest("button");
    if (!chip) throw new Error("emoji chip button not found");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(customEmojiInput().value).toBe("");
  });

  it("accepts a custom emoji typed into the free-text field", () => {
    renderEditor();
    const custom = customEmojiInput();
    fireEvent.change(custom, { target: { value: "🦖" } });
    expect(custom.value).toBe("🦖");
    // None of the fixed choices is now selected.
    const pressed = document.querySelectorAll('button[aria-pressed="true"]');
    for (const button of pressed) {
      expect(button.textContent).not.toBe("🦖");
    }
  });

  it("keeps only the first grapheme when more than one is typed or pasted", () => {
    renderEditor();
    const custom = customEmojiInput();
    fireEvent.change(custom, { target: { value: "🦖🐶" } });
    expect(custom.value).toBe("🦖");
  });

  it("keeps a multi-person ZWJ sequence intact even though it is over 8 UTF-16 units", () => {
    // 👨‍👩‍👧‍👦 is 11 UTF-16 code units — a DOM-level maxLength here would
    // truncate it (browsers enforce maxlength before onChange runs), landing
    // a dangling ZWJ that Intl.Segmenter would still fold into "one
    // grapheme", saving a broken glyph as the task's emoji.
    renderEditor();
    const custom = customEmojiInput();
    const family = "👨‍👩‍👧‍👦";
    fireEvent.change(custom, { target: { value: family } });
    expect(custom.value).toBe(family);
  });

  it("re-selecting a palette emoji clears the custom field", () => {
    renderEditor();
    const custom = customEmojiInput();
    fireEvent.change(custom, { target: { value: "🦖" } });
    const star = screen.getByText("⭐").closest("button");
    if (!star) throw new Error("star chip button not found");
    fireEvent.click(star);
    expect(custom.value).toBe("");
  });
});
