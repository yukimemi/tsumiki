// The family list, with the two controls that change who can do what.
//
// Controls a person is not allowed to use are disabled with the reason spelled
// out beside them rather than hidden: a parent who cannot remove the owner
// should learn that from the screen, not from a button that is simply absent.

import { useState } from "react";
import type { JSX } from "react";

import { removeMember, setMemberRole } from "../data/households";
import { ROLE_LABELS_JA } from "../lib/roles";
import { useAction } from "../screens/useAction";
import type { Household, MemberInfo, Role } from "../types";
import { Avatar, Badge, Button, Card, ConfirmDialog, Select } from "./ui";

type MemberRow = { uid: string; role: Role; info: MemberInfo };

/** Ownership does not move: it belongs to whoever made the family. */
const ASSIGNABLE: readonly Exclude<Role, "owner">[] = ["parent", "child"];

function isAssignable(value: string): value is Exclude<Role, "owner"> {
  return value === "parent" || value === "child";
}

export type MemberSettingsProps = {
  household: Household;
  members: MemberRow[];
  currentUid: string;
  isOwner: boolean;
};

export function MemberSettings({
  household,
  members,
  currentUid,
  isOwner,
}: MemberSettingsProps): JSX.Element {
  const action = useAction();
  const [removing, setRemoving] = useState<MemberRow | null>(null);

  // Owner is a parent with extras, so the two fold together here exactly as
  // `isParent` in lib/roles does it.
  const canManage = isOwner || household.memberRoles?.[currentUid] === "parent";

  const changeRole = (uid: string, next: Role): void => {
    void action.run(() => setMemberRole(household.id, uid, next));
  };

  const confirmRemove = (): void => {
    const target = removing;
    if (!target) return;
    void action.run(() => removeMember(household.id, target.uid)).then((ok) => {
      if (ok) setRemoving(null);
    });
  };

  return (
    <Card>
      <h2 className="mb-3 text-base font-bold text-ink">かぞくの みんな</h2>

      {action.error ? (
        <p role="alert" className="mb-2">
          <Badge tone="late">{action.error}</Badge>
        </p>
      ) : null}

      <ul className="divide-y divide-rule">
        {members.map((member) => {
          const isTargetOwner = member.uid === household.ownerId;
          const isSelf = member.uid === currentUid;
          // Two separate rules that share one row: the owner keeps the family,
          // and nobody locks themselves out of their own household.
          const removeReason = isTargetOwner
            ? "かんりにんは はずせません"
            : isSelf
              ? "じぶんは はずせません"
              : null;

          return (
            <li key={member.uid} className="py-2">
              <div className="flex items-center gap-3">
                <Avatar info={member.info} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-ink">
                    {member.info.displayName}
                    {isSelf ? (
                      <span className="ml-1 text-sm font-normal text-self">
                        （じぶん）
                      </span>
                    ) : null}
                  </span>
                  {member.info.email ? (
                    <span className="block truncate text-xs text-muted">
                      {member.info.email}
                    </span>
                  ) : null}
                </span>
                <Badge>{ROLE_LABELS_JA[member.role]}</Badge>
              </div>

              {canManage ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Select
                    aria-label={`${member.info.displayName} の やくわり`}
                    className="w-auto"
                    value={member.role}
                    disabled={isTargetOwner || action.busy}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (isAssignable(next)) changeRole(member.uid, next);
                    }}
                  >
                    {isTargetOwner ? (
                      <option value="owner">{ROLE_LABELS_JA.owner}</option>
                    ) : (
                      ASSIGNABLE.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS_JA[role]}
                        </option>
                      ))
                    )}
                  </Select>

                  <Button
                    variant="ghost"
                    disabled={removeReason !== null || action.busy}
                    onClick={() => setRemoving(member)}
                  >
                    はずす
                  </Button>

                  {removeReason ? (
                    <span className="text-sm text-muted">{removeReason}</span>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={removing !== null}
        title="かぞくから はずす?"
        message={
          <>
            {removing?.info.displayName}
            {
              " は もう この かぞくの やることが できなくなって、この アプリで かぞくを みられなくなるよ。いままでの きろくと コインは かぞくの れきしに のこるよ。また あとから メールで さそえるよ。"
            }
          </>
        }
        confirmLabel="はずす"
        cancelLabel="やめる"
        tone="danger"
        busy={action.busy}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </Card>
  );
}
