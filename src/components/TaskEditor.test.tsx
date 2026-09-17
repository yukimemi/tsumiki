// @vitest-environment jsdom
//
// The emoji field mixes a fixed palette with free text: this is the one
// place both must agree on which is "selected". A regression here would
// either lose a custom emoji the moment another field re-renders, or let
// the custom input silently disagree with a chip that looks selected.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  vi.clearAllMocks();
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

describe("TaskEditor deadline field", () => {
  // Field concatenates its hint text into the wrapping <label>, so the
  // accessible name is "きげんこのひを すぎると…", not the bare "きげん" —
  // exact: false matches the substring instead of assuming there is no hint.
  it("does not show for the default recurring cadence", () => {
    renderEditor();
    expect(screen.queryByLabelText("きげん", { exact: false })).toBeNull();
  });

  it("shows once '1かいだけ' is picked", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("radio", { name: "1かいだけ" }));
    expect(screen.getByLabelText("きげん", { exact: false })).toBeTruthy();
  });

  it("hides again once a recurring cadence is picked back", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("radio", { name: "1かいだけ" }));
    fireEvent.click(screen.getByRole("radio", { name: "まいにち" }));
    expect(screen.queryByLabelText("きげん", { exact: false })).toBeNull();
  });
});

describe("TaskEditor active period fields", () => {
  const submit = () =>
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);

  function fillTitle() {
    fireEvent.change(screen.getByPlaceholderText("れい: おふろそうじ"), {
      target: { value: "べんきょう 1じかん" },
    });
  }

  function setPeriod(from: string, until: string) {
    fireEvent.change(screen.getByLabelText("はじまるひ", { exact: false }), {
      target: { value: from },
    });
    fireEvent.change(screen.getByLabelText("おわるひ", { exact: false }), {
      target: { value: until },
    });
  }

  it("creates a 100-coin task with a Silver Week period", async () => {
    const { createTask } = await import("../data/tasks");
    vi.mocked(createTask).mockResolvedValue("t1");
    renderEditor();
    fillTitle();
    setPeriod("2026-09-19", "2026-09-23");
    const coinInput = screen.getByLabelText("コインの かず") as HTMLInputElement;
    fireEvent.change(coinInput, { target: { value: "100" } });
    submit();
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    const draft = vi.mocked(createTask).mock.lastCall![2];
    expect(draft.coin).toBe(100);
    expect(draft.activeFrom).toBe("2026-09-19");
    expect(draft.activeUntil).toBe("2026-09-23");
    expect(draft.repeat).toEqual({ type: "daily" });
  });

  it("rejects an end date before the start date", async () => {
    const { createTask } = await import("../data/tasks");
    renderEditor();
    fillTitle();
    setPeriod("2026-09-23", "2026-09-19");
    submit();
    expect(
      await screen.findByText("おわるひは はじまるひと おなじか あとに してね"),
    ).toBeTruthy();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("submits with the period left empty", async () => {
    const { createTask } = await import("../data/tasks");
    vi.mocked(createTask).mockResolvedValue("t1");
    renderEditor();
    fillTitle();
    submit();
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    const draft = vi.mocked(createTask).mock.lastCall![2];
    expect(draft.activeFrom).toBe("");
    expect(draft.activeUntil).toBe("");
  });
});
