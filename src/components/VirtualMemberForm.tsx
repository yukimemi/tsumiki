// Adding a family member with no Google account and no device of their own.
//
// Everywhere else, joining a household means claiming an email invite — that
// needs a device to sign in with. A parent adds a virtual member directly
// instead, no invite/claim round trip: `addVirtualMember` writes the member
// straight onto `memberIds`/`memberRoles`/`memberInfo`. Every action on their
// behalf then goes through the parent's own session (member switcher on the
// day screen, wallet actions here) — see `firestore.rules`' `isParent`
// fallbacks on entries/ledger/payouts.

import { useState } from "react";
import type { JSX } from "react";

import { addVirtualMember } from "../data/households";
import { freeMemberColor } from "../lib/roles";
import { useAction } from "../screens/useAction";
import type { Household, MemberColor } from "../types";
import { ColorPicker, EmojiPicker } from "./MemberIdentity";
import { Badge, Button, Card, Field, Input } from "./ui";

/** Distinct from the invite claim's default, so the two flows never look
 *  visually identical in the family list. */
const DEFAULT_EMOJI = "🧸";

export type VirtualMemberFormProps = {
  household: Household;
};

export function VirtualMemberForm({
  household,
}: VirtualMemberFormProps): JSX.Element {
  const action = useAction();
  const [displayName, setDisplayName] = useState("");
  const [color, setColor] = useState<MemberColor>(() =>
    freeMemberColor(household.memberInfo),
  );
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI);

  const trimmed = displayName.trim();
  const canAdd = trimmed.length > 0 && !action.busy;

  const submit = (): void => {
    if (!canAdd) return;
    void action
      .run(async () => {
        await addVirtualMember(household, {
          displayName: trimmed,
          color,
          emoji,
        });
      })
      .then((ok) => {
        if (!ok) return;
        setDisplayName("");
        setColor(freeMemberColor(household.memberInfo));
        setEmoji(DEFAULT_EMOJI);
      });
  };

  return (
    <Card>
      <h2 className="mb-1 text-base font-bold text-ink">
        スマホが なくても かぞくに いれる
      </h2>
      <p className="mb-3 text-sm leading-relaxed text-muted">
        Google の アカウントが なくても だいじょうぶ。おうちの ひとが
        かわりに タスクを おわらせたり、コインを かんりしたり できるよ。
      </p>

      <div className="space-y-4">
        <Field label="なまえ" hint="みんなに でる なまえだよ">
          <Input
            value={displayName}
            maxLength={20}
            autoComplete="off"
            placeholder="たとえば：いもうと"
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>

        <Field label="いろ" group>
          <ColorPicker value={color} onChange={setColor} />
        </Field>

        <Field label="えもじ" group>
          <EmojiPicker value={emoji} onChange={setEmoji} />
        </Field>

        {action.error ? (
          <p role="alert">
            <Badge tone="late">{action.error}</Badge>
          </p>
        ) : null}

        <Button block onClick={submit} disabled={!canAdd}>
          ついかする
        </Button>
      </div>
    </Card>
  );
}
