import { useState } from "react";

import { useAuth } from "../auth/context";
import { useUid } from "../auth/context";
import { AppearanceSettings } from "../components/AppearanceSettings";
import { InviteForm } from "../components/InviteForm";
import { MemberIdentity } from "../components/MemberIdentity";
import { MemberSettings } from "../components/MemberSettings";
import { TaskManager } from "../components/TaskManager";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Select,
} from "../components/ui";
import { deleteHousehold, updateHousehold } from "../data/households";
import { useHousehold } from "../household/context";
import { useAction } from "./useAction";

/**
 * Everything that is configuration rather than daily use, in one scroll.
 *
 * The sections are ordered by how often a parent touches them, not by how
 * important they are: identity and members change once, tasks change weekly,
 * so tasks sit in the middle where a thumb lands.
 */
export function SettingsScreen() {
  const uid = useUid();
  const { signOutUser } = useAuth();
  const { households, household, members, isParent, isOwner, select } =
    useHousehold();

  if (!household) return null;

  const me = members.find((member) => member.uid === uid) ?? null;

  return (
    <div className="flex flex-col gap-4 px-3 py-4">
      <HouseholdCard
        householdId={household.id}
        name={household.name}
        coinYen={household.coinYen}
        canEdit={isOwner}
      />

      {households.length > 1 ? (
        <Card>
          <h2 className="mb-2 text-base font-bold text-ink">かぞくを えらぶ</h2>
          <Field label="いま みている かぞく">
            <Select
              value={household.id}
              onChange={(event) => select(event.target.value)}
            >
              {households.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      ) : null}

      {me ? (
        <Card>
          <h2 className="mb-3 text-base font-bold text-ink">あなた</h2>
          <MemberIdentity
            householdId={household.id}
            uid={uid}
            info={me.info}
          />
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 text-base font-bold text-ink">かぞくの ひと</h2>
        <MemberSettings
          household={household}
          members={members}
          currentUid={uid}
          isOwner={isOwner}
        />
        {isParent ? (
          <div className="mt-4 border-t border-rule pt-4">
            <InviteForm household={household} />
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-bold text-ink">やること</h2>
        {isParent ? (
          <TaskManager
            householdId={household.id}
            actorUid={uid}
            members={members}
            coinYen={household.coinYen}
          />
        ) : (
          <p className="text-sm text-muted">
            やることの リストは おうちの ひとが つくります。
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-bold text-ink">みため</h2>
        <AppearanceSettings />
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-bold text-ink">そのほか</h2>
        <div className="flex flex-col gap-3">
          <Button variant="ghost" block onClick={() => void signOutUser()}>
            サインアウト
          </Button>
          {isOwner ? <DeleteHousehold id={household.id} name={household.name} /> : null}
        </div>
      </Card>
    </div>
  );
}

function HouseholdCard(props: {
  householdId: string;
  name: string;
  coinYen: number;
  canEdit: boolean;
}) {
  const action = useAction();
  // Seeded from the document and then owned by the form. Remounting on a
  // household switch is the router's job, not an effect's.
  const [name, setName] = useState(props.name);
  const [coinYen, setCoinYen] = useState(String(props.coinYen));

  const parsedRate = Number.parseInt(coinYen, 10);
  const rateValid = Number.isFinite(parsedRate) && parsedRate >= 0;
  const dirty = name.trim() !== props.name || parsedRate !== props.coinYen;

  const save = () => {
    if (!rateValid || name.trim().length === 0) return;
    void action.run(() =>
      updateHousehold(props.householdId, {
        name: name.trim(),
        coinYen: parsedRate,
      }),
    );
  };

  return (
    <Card>
      <h2 className="mb-3 text-base font-bold text-ink">かぞく</h2>

      {props.canEdit ? (
        <div className="flex flex-col gap-3">
          <Field label="かぞくの なまえ">
            <Input
              value={name}
              maxLength={30}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field
            label="1コイン = なん円"
            hint={
              rateValid
                ? `100コイン で ${100 * parsedRate}円 になります`
                : "0いじょうの すうじを いれてください"
            }
            error={rateValid ? undefined : "すうじで いれてください"}
          >
            <Input
              inputMode="numeric"
              value={coinYen}
              onChange={(event) => setCoinYen(event.target.value)}
            />
          </Field>

          {action.error ? <Badge tone="late">{action.error}</Badge> : null}

          <Button
            onClick={save}
            disabled={!dirty || !rateValid || action.busy}
            block
          >
            ほぞんする
          </Button>
        </div>
      ) : (
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">かぞくの なまえ</dt>
            <dd className="font-bold text-ink">{props.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">1コイン</dt>
            <dd className="font-bold text-ink">{props.coinYen}円</dd>
          </div>
        </dl>
      )}
    </Card>
  );
}

/**
 * Typing the family name is the confirmation. A destructive action this large
 * should cost more than one tap on a phone that a child also holds.
 */
function DeleteHousehold(props: { id: string; name: string }) {
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const close = () => {
    setOpen(false);
    setTyped("");
    action.clear();
  };

  return (
    <>
      <Button variant="danger" block onClick={() => setOpen(true)}>
        かぞくを けす
      </Button>

      <ConfirmDialog
        open={open}
        tone="danger"
        title="かぞくを けしますか？"
        confirmLabel="けす"
        busy={action.busy}
        onClose={close}
        onConfirm={() => {
          if (typed.trim() !== props.name) return;
          void action.run(() => deleteHousehold(props.id)).then((ok) => {
            if (ok) close();
          });
        }}
        message={
          <div className="flex flex-col gap-3 text-left">
            <p>
              やること、きろく、コメント、コインが かぞく ぜんいんぶん
              すべて きえます。もとには もどせません。
            </p>
            <Field label={`けす なら「${props.name}」と いれてください`}>
              <Input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            </Field>
            {typed.trim() !== props.name ? (
              <p className="text-xs text-muted">なまえが あっていません</p>
            ) : null}
            {action.error ? <Badge tone="late">{action.error}</Badge> : null}
          </div>
        }
      />
    </>
  );
}
