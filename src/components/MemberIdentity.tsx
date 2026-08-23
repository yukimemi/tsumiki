// Your own name, colour and emoji.
//
// The three pickers live here rather than in the settings screen because the
// onboarding screen needs the same colour and emoji controls before any
// household exists — so they are exported as components and reused there.

import { useId, useState } from "react";
import type { JSX } from "react";

import { updateMemberInfo } from "../data/households";
import { useAction } from "../screens/useAction";
import { MEMBER_COLORS } from "../types";
import type { MemberColor, MemberInfo } from "../types";
import { Avatar, Badge, Button, Card, Chip, Field, Input } from "./ui";

/** Static map: Tailwind cannot see a class name built at runtime. */
const COLOR_CLASS: Record<MemberColor, string> = {
  sakura: "bg-m-sakura",
  sora: "bg-m-sora",
  wakaba: "bg-m-wakaba",
  yamabuki: "bg-m-yamabuki",
  fuji: "bg-m-fuji",
  kohaku: "bg-m-kohaku",
};

const COLOR_LABELS_JA: Record<MemberColor, string> = {
  sakura: "さくらいろ",
  sora: "そらいろ",
  wakaba: "わかばいろ",
  yamabuki: "やまぶきいろ",
  fuji: "ふじいろ",
  kohaku: "こはくいろ",
};

/** Faces a small child can tell apart at avatar size. */
const EMOJI_CHOICES = [
  "🧱",
  "🐶",
  "🐱",
  "🐰",
  "🐻",
  "🦊",
  "🐧",
  "🦄",
  "⚽",
  "🍓",
  "🌟",
  "🚀",
];

export type ColorPickerProps = {
  value: MemberColor;
  onChange(next: MemberColor): void;
  /** Shared radio name; generated when omitted. */
  name?: string;
};

/**
 * Real radios under the paint, like SegmentedControl: arrow-key movement and
 * the roving tabindex come from the platform instead of being re-implemented.
 */
export function ColorPicker({
  value,
  onChange,
  name,
}: ColorPickerProps): JSX.Element {
  const generated = useId();
  const group = name ?? generated;

  return (
    <div role="radiogroup" aria-label="いろ" className="flex flex-wrap gap-2">
      {MEMBER_COLORS.map((color) => (
        // `relative` keeps the `sr-only` radio's absolute box inside this
        // label. See the same note in ui.tsx SegmentedControl: an unpositioned
        // ancestor makes the radio extend the document and scroll the shell.
        <label key={color} className="relative block">
          <input
            type="radio"
            name={group}
            value={color}
            checked={color === value}
            aria-label={COLOR_LABELS_JA[color]}
            onChange={() => onChange(color)}
            className="peer sr-only"
          />
          <span
            className={[
              "flex min-h-tap min-w-tap items-center justify-center rounded-pill border-2 border-transparent transition-colors",
              "peer-checked:border-self peer-focus-visible:ring-2 peer-focus-visible:ring-self peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-paper",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className={`h-7 w-7 rounded-pill ${COLOR_CLASS[color]}`}
            />
          </span>
        </label>
      ))}
    </div>
  );
}

export type EmojiPickerProps = {
  value: string;
  onChange(next: string): void;
};

export function EmojiPicker({ value, onChange }: EmojiPickerProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {EMOJI_CHOICES.map((emoji) => (
        <Chip
          key={emoji}
          tone="self"
          selected={emoji === value}
          onClick={() => onChange(emoji)}
        >
          <span aria-hidden="true" className="text-lg">
            {emoji}
          </span>
        </Chip>
      ))}
    </div>
  );
}

export type MemberIdentityProps = {
  householdId: string;
  uid: string;
  info: MemberInfo;
};

export function MemberIdentity({
  householdId,
  uid,
  info,
}: MemberIdentityProps): JSX.Element {
  const action = useAction();
  const [displayName, setDisplayName] = useState(info.displayName);
  const [color, setColor] = useState<MemberColor>(info.color);
  const [emoji, setEmoji] = useState(info.emoji);

  const trimmed = displayName.trim();
  const changed =
    trimmed !== info.displayName || color !== info.color || emoji !== info.emoji;
  const canSave = changed && trimmed.length > 0 && !action.busy;

  // The preview keeps photoURL so it shows what the family actually sees,
  // rather than promising an emoji that a Google photo would cover.
  const preview: MemberInfo = {
    ...info,
    displayName: trimmed || info.displayName,
    color,
    emoji,
  };

  const save = (): void => {
    void action.run(() =>
      updateMemberInfo(householdId, uid, {
        displayName: trimmed,
        color,
        emoji,
      }),
    );
  };

  return (
    <Card>
      <h2 className="mb-3 text-base font-bold text-ink">じぶんの こと</h2>

      <div className="flex items-start gap-4">
        <div className="flex flex-none flex-col items-center gap-1">
          <Avatar info={preview} size="lg" />
          <span className="max-w-[5rem] truncate text-xs text-muted">
            {preview.displayName}
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <Field label="なまえ" hint="みんなに でる なまえだよ">
            <Input
              value={displayName}
              maxLength={20}
              autoComplete="off"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>

          <Field label="いろ" group>
            <ColorPicker value={color} onChange={setColor} />
          </Field>

          <Field label="えもじ" group>
            <EmojiPicker value={emoji} onChange={setEmoji} />
          </Field>
        </div>
      </div>

      {info.photoURL ? (
        <p className="mt-3 text-sm text-muted">
          Google の しゃしんが あるときは、しゃしんが でるよ。
        </p>
      ) : null}

      {action.error ? (
        <p role="alert" className="mt-3">
          <Badge tone="late">{action.error}</Badge>
        </p>
      ) : null}

      <div className="mt-4">
        <Button block onClick={save} disabled={!canSave}>
          ほぞん する
        </Button>
      </div>
    </Card>
  );
}
