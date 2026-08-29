import { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/context";
import { useUid } from "../auth/context";
import { AppearanceSettings } from "../components/AppearanceSettings";
import { FreeTierAd } from "../components/FreeTierAd";
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
import { isAdminEmail } from "../lib/admin";
import { payoutPlan } from "../lib/payout";
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
  const { user, signOutUser } = useAuth();
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
        payoutMinYen={household.payoutMinYen ?? 0}
        payoutStepYen={household.payoutStepYen ?? 0}
        canEdit={isOwner}
        plan={household.plan ?? "free"}
        taskCount={household.taskCount ?? 0}
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

      {isParent ? <FreeTierAd plan={household.plan ?? "free"} /> : null}

      <Card>
        <h2 className="mb-3 text-base font-bold text-ink">やること</h2>
        {isParent ? (
          <TaskManager
            householdId={household.id}
            actorUid={uid}
            members={members}
            coinYen={household.coinYen}
            plan={household.plan ?? "free"}
            taskCount={household.taskCount ?? 0}
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
          <Link
            to="/about"
            className="min-h-tap flex items-center justify-center rounded-card border border-rule text-sm text-muted"
          >
            このアプリについて
          </Link>
          <Button variant="ghost" block onClick={() => void signOutUser()}>
            サインアウト
          </Button>
          {isOwner ? <DeleteHousehold id={household.id} name={household.name} /> : null}
          {isAdminEmail(user?.email) ? (
            <Link
              to="/admin"
              className="min-h-tap flex items-center justify-center rounded-card border border-rule text-sm text-muted"
            >
              かんりがめん
            </Link>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function HouseholdCard(props: {
  householdId: string;
  name: string;
  coinYen: number;
  payoutMinYen: number;
  payoutStepYen: number;
  canEdit: boolean;
  plan: "free" | "pro";
  taskCount: number;
}) {
  const action = useAction();
  // Seeded from the document and then owned by the form. Remounting on a
  // household switch is the router's job, not an effect's.
  const [name, setName] = useState(props.name);
  const [coinYen, setCoinYen] = useState(String(props.coinYen));
  const [minYen, setMinYen] = useState(String(props.payoutMinYen));
  const [stepYen, setStepYen] = useState(String(props.payoutStepYen));

  const parsedRate = Number.parseInt(coinYen, 10);
  const parsedMin = Number.parseInt(minYen, 10);
  const parsedStep = Number.parseInt(stepYen, 10);
  const rateValid = Number.isFinite(parsedRate) && parsedRate >= 0;
  const minValid = Number.isFinite(parsedMin) && parsedMin >= 0;
  const stepValid = Number.isFinite(parsedStep) && parsedStep >= 0;
  const valid = rateValid && minValid && stepValid;
  const dirty =
    name.trim() !== props.name ||
    parsedRate !== props.coinYen ||
    parsedMin !== props.payoutMinYen ||
    parsedStep !== props.payoutStepYen;

  // What the rules actually resolve to in coins, shown so a parent is never
  // surprised by the arithmetic between yen and whole coins.
  const preview = payoutPlan({
    balanceCoins: Number.MAX_SAFE_INTEGER,
    coinYen: rateValid ? parsedRate : 0,
    minYen: minValid ? parsedMin : 0,
    stepYen: stepValid ? parsedStep : 0,
  });

  const save = () => {
    if (!valid || name.trim().length === 0) return;
    void action.run(() =>
      updateHousehold(props.householdId, {
        name: name.trim(),
        coinYen: parsedRate,
        payoutMinYen: parsedMin,
        payoutStepYen: parsedStep,
      }),
    );
  };

  return (
    <Card>
      <h2 className="mb-3 text-base font-bold text-ink">かぞく</h2>

      <p className="mb-3 text-sm text-muted">
        {props.plan === "pro"
          ? "いまは pro プランです。しゃしんも つかえます。"
          : `いまは むりょうプランです。やることは いま ${props.taskCount} こ／30こまで。しゃしんは pro プランで つかえます。`}
      </p>

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

          <Field
            label="こうかんは なん円から"
            hint="0 に すると いくらでも こうかんできます"
            error={minValid ? undefined : "すうじで いれてください"}
          >
            <Input
              inputMode="numeric"
              value={minYen}
              onChange={(event) => setMinYen(event.target.value)}
            />
          </Field>

          <Field
            label="なん円ずつ こうかんする"
            hint={
              valid && parsedStep > 0
                ? `${preview.stepCoins}コイン（${preview.stepCoins * parsedRate}円）ずつ、さいてい ${preview.minCoins}コイン`
                : "0 に すると 1コインたんいで こうかんできます"
            }
            error={stepValid ? undefined : "すうじで いれてください"}
          >
            <Input
              inputMode="numeric"
              value={stepYen}
              onChange={(event) => setStepYen(event.target.value)}
            />
          </Field>

          {action.error ? <Badge tone="late">{action.error}</Badge> : null}

          <Button
            onClick={save}
            disabled={!dirty || !valid || action.busy}
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
          {props.payoutMinYen > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted">こうかん</dt>
              <dd className="font-bold text-ink">
                {props.payoutMinYen}円から
                {props.payoutStepYen > 0 ? ` ${props.payoutStepYen}円ずつ` : ""}
              </dd>
            </div>
          ) : null}
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
