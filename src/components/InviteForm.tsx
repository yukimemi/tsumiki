// Email invites: the only way anybody joins a family.
//
// The address is lowercased before every write. That is load-bearing, not
// tidiness: the rules compare `invitedEmails` against the verified email claim
// in the token, which Google hands over in lower case. A stored "Foo@bar.com"
// would sit in the list forever and never match.

import { useState } from "react";
import type { JSX } from "react";
import { z } from "zod";

import { cancelEmailInvite, inviteByEmail } from "../data/invites";
import { decodeEmailKey } from "../lib/ids";
import { useAction } from "../screens/useAction";
import type { Household, Role } from "../types";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  SegmentedControl,
} from "./ui";

/** Nobody is invited as owner: that role belongs to whoever made the family. */
type InviteRole = Extract<Role, "parent" | "child">;

const ROLE_OPTIONS: readonly { value: InviteRole; label: string }[] = [
  { value: "parent", label: "おや" },
  { value: "child", label: "こども" },
];

const emailSchema = z.email();

export type InviteFormProps = {
  household: Household;
};

export function InviteForm({ household }: InviteFormProps): JSX.Element {
  const invite = useAction();
  const cancel = useAction();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("child");
  const [formError, setFormError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const pending = household.invitedEmails ?? [];

  // `invitedEmails` holds plain addresses, but `pendingRoles` is keyed by the
  // same address with dots percent-encoded, because a Firestore map key cannot
  // contain one. Decode the map once instead of re-encoding on every row.
  const roleByEmail: Record<string, Role> = Object.fromEntries(
    Object.entries(household.pendingRoles ?? {}).map(([key, role]) => [
      decodeEmailKey(key),
      role,
    ]),
  );

  const roleOfInvite = (address: string): Role =>
    roleByEmail[address] ?? "child";

  const submit = (): void => {
    const address = email.trim().toLowerCase();
    if (!emailSchema.safeParse(address).success) {
      setFormError("メールアドレスの かたちが ちがうみたい");
      return;
    }
    setFormError(null);
    void invite.run(() => inviteByEmail(household.id, address, role)).then(
      (ok) => {
        if (ok) setEmail("");
      },
    );
  };

  const confirmCancel = (): void => {
    const address = cancelling;
    if (!address) return;
    void cancel
      .run(() => cancelEmailInvite(household.id, address))
      .then((ok) => {
        if (ok) setCancelling(null);
      });
  };

  return (
    <Card>
      <h2 className="mb-1 text-base font-bold text-ink">かぞくを さそう</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted">
        さそいたい ひとの Google の メールアドレスを いれてね。そのひとが
        おなじ アドレスで サインインしたら、その ときに かぞくに はいるよ。
      </p>

      <div className="space-y-3">
        <Field label="メールアドレス" error={formError}>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tsumiki@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (formError) setFormError(null);
            }}
          />
        </Field>

        <Field label="やくわり" group>
          <SegmentedControl<InviteRole>
            value={role}
            options={ROLE_OPTIONS}
            onChange={setRole}
            label="やくわり"
          />
        </Field>

        {invite.error ? (
          <p role="alert">
            <Badge tone="late">{invite.error}</Badge>
          </p>
        ) : null}

        <Button block onClick={submit} disabled={invite.busy}>
          さそう
        </Button>
      </div>

      {pending.length > 0 ? (
        <section className="mt-5" aria-label="まっている しょうたい">
          <h3 className="mb-2 text-sm font-bold text-ink">
            まっている しょうたい
          </h3>
          {cancel.error ? (
            <p role="alert" className="mb-2">
              <Badge tone="late">{cancel.error}</Badge>
            </p>
          ) : null}
          <ul className="divide-y divide-rule">
            {pending.map((address) => (
              <li
                key={address}
                className="flex min-h-tap items-center gap-2 py-1"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">
                  {address}
                </span>
                <Badge>
                  {roleOfInvite(address) === "parent" ? "おや" : "こども"}
                </Badge>
                <Button
                  variant="ghost"
                  aria-label={`${address} の しょうたいを とりけす`}
                  onClick={() => setCancelling(address)}
                  disabled={cancel.busy}
                >
                  とりけす
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ConfirmDialog
        open={cancelling !== null}
        title="しょうたいを とりけす?"
        message={
          <>
            {cancelling}
            {" さんは かぞくに はいれなくなるよ。いままでの きろくや コインは そのまま のこるよ。また あとから さそえるよ。"}
          </>
        }
        confirmLabel="とりけす"
        cancelLabel="やめる"
        tone="danger"
        busy={cancel.busy}
        onConfirm={confirmCancel}
        onClose={() => setCancelling(null)}
      />
    </Card>
  );
}
