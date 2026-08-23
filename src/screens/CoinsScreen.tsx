import { useState } from "react";
import type { JSX } from "react";

import { useUid } from "../auth/context";
import { ApprovalQueue } from "../components/ApprovalQueue";
import { CommentThread } from "../components/CommentThread";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  CoinAmount,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  SegmentedControl,
  Sheet,
  Skeleton,
  Textarea,
} from "../components/ui";
import {
  adjustCoins,
  balanceOf,
  payPayout,
  rejectPayout,
  requestPayout,
  useBalances,
  useLedger,
  usePayouts,
} from "../data/coins";
import { approveEntry, rejectEntry, usePendingEntries } from "../data/entries";
import { useEffects } from "../effects/context";
import { useHousehold } from "../household/context";
import { dateKeyOf, formatDateJa } from "../lib/date";
import type { Entry, LedgerEntry, LedgerReason, Payout } from "../types";
import { useAction } from "./useAction";

/**
 * A shared board and a private wallet at once: your own balance and your own
 * exchange requests are yours, but the family totals are visible to everyone
 * on purpose — the point of the app is that the effort is seen. Everything a
 * child must not do (approving, paying, granting) is gated on `isParent`.
 */

/** The two reasons a parent can move coins by hand. */
type GrantReason = Extract<LedgerReason, "bonus" | "adjust">;

const GRANT_OPTIONS: readonly { value: GrantReason; label: string }[] = [
  { value: "bonus", label: "ごほうび" },
  { value: "adjust", label: "ちょうせい" },
];

const REASON_JA: Record<LedgerReason, string> = {
  task: "やること",
  bonus: "ごほうび",
  adjust: "ちょうせい",
  payout: "おこづかい",
};

/** Quick amounts for an exchange. Shown only while the balance covers them. */
const QUICK_COINS: readonly number[] = [50, 100];

const GRANT_LIMIT = 999;

/** Whole coins only, inside the limit; `bonus` can never take coins away. */
function grantDeltaOf(raw: number, reason: GrantReason): number {
  const whole = Number.isFinite(raw) ? Math.trunc(raw) : 0;
  const bounded = Math.max(-GRANT_LIMIT, Math.min(GRANT_LIMIT, whole));
  return reason === "bonus" ? Math.max(0, bounded) : bounded;
}

function requestedDate(payout: Payout): string {
  return formatDateJa(dateKeyOf(payout.requestedAt.toDate()));
}

export function CoinsScreen(): JSX.Element {
  const uid = useUid();
  const { household, householdId, members, isParent } = useHousehold();
  const { celebrate } = useEffects();

  const [ledgerFilter, setLedgerFilter] = useState("all");

  const balances = useBalances(householdId);
  const payouts = usePayouts(householdId);
  // Only a parent can act on the queue, so only a parent subscribes to it.
  const pending = usePendingEntries(isParent ? householdId : null);
  const ledger = useLedger(
    householdId,
    ledgerFilter === "all" ? null : ledgerFilter,
  );

  // One guard per control group, so a failed payment does not paint an error
  // next to the exchange button that worked.
  const approveAction = useAction();
  const rejectAction = useAction();
  const payoutAction = useAction();
  const payAction = useAction();
  const grantAction = useAction();

  const [commentsEntry, setCommentsEntry] = useState<Entry | null>(null);
  const [rejectingEntry, setRejectingEntry] = useState<Entry | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutDraft, setPayoutDraft] = useState(1);
  const [payoutNote, setPayoutNote] = useState("");

  const [historyOpen, setHistoryOpen] = useState(false);

  const [grantOpen, setGrantOpen] = useState(false);
  const [grantMemberId, setGrantMemberId] = useState("");
  const [grantReason, setGrantReason] = useState<GrantReason>("bonus");
  const [grantText, setGrantText] = useState("1");
  const [grantNote, setGrantNote] = useState("");

  // `HouseholdGate` shows onboarding until a household exists, so this is the
  // type gate for the writes below rather than a state a user can reach.
  if (!household || !householdId) return <Skeleton rows={4} />;

  const coinYen = household.coinYen;

  const myBalance = balanceOf(balances.data, uid);
  const myCoins = myBalance?.coins ?? 0;
  const myEarned = myBalance?.earned ?? 0;

  const memberOf = (memberId: string) =>
    members.find((member) => member.uid === memberId) ?? null;

  const nameOf = (memberId: string): string =>
    memberOf(memberId)?.info.displayName ?? "だれか";

  // Descending by coins; `sort` is stable, so equal balances keep the
  // household's own member order instead of shuffling on every snapshot.
  const board = members
    .map((member) => ({
      member,
      coins: balanceOf(balances.data, member.uid)?.coins ?? 0,
    }))
    .sort((a, b) => b.coins - a.coins);

  // A child sees only their own requests; a parent sees the whole family's.
  const visiblePayouts = payouts.data.filter(
    (payout) => isParent || payout.memberId === uid,
  );
  const openPayouts = visiblePayouts.filter(
    (payout) => payout.status === "requested",
  );
  const donePayouts = visiblePayouts.filter(
    (payout) => payout.status !== "requested",
  );

  // Clamped during render: the balance moves under the sheet while it is open.
  const payoutCoins = Math.min(Math.max(1, payoutDraft), Math.max(1, myCoins));
  const payoutYen = payoutCoins * coinYen;

  const grantMember = grantMemberId || (members[0]?.uid ?? "");
  const grantDelta = grantDeltaOf(Number.parseInt(grantText, 10), grantReason);

  const handleApprove = async (entry: Entry, origin: DOMRect): Promise<void> => {
    const ok = await approveAction.run(() => approveEntry(entry, uid));
    // ApprovalQueue awaits this handler and counts a rejection as one row that
    // did not land, so the failure has to propagate even though `run` has
    // already turned it into a message on screen.
    if (!ok) throw new Error("approveEntry failed");
    celebrate("pop", { origin });
    celebrate("coinfly", { coin: entry.coin, origin });
  };

  const submitReject = async (): Promise<void> => {
    const entry = rejectingEntry;
    if (!entry) return;
    // An empty reason is dropped by `clean()`, which is what "optional" means.
    const ok = await rejectAction.run(() =>
      rejectEntry(entry, uid, rejectReason),
    );
    if (!ok) return;
    celebrate("quake");
    setRejectingEntry(null);
    setRejectReason("");
  };

  const submitPayout = async (): Promise<void> => {
    const ok = await payoutAction.run(() =>
      requestPayout({
        householdId,
        memberId: uid,
        coins: payoutCoins,
        coinYen,
        note: payoutNote.trim() || undefined,
      }),
    );
    if (!ok) return;
    setPayoutOpen(false);
    setPayoutDraft(1);
    setPayoutNote("");
  };

  const handlePay = async (payout: Payout, origin: DOMRect): Promise<void> => {
    const ok = await payAction.run(() => payPayout(payout, uid));
    if (!ok) return;
    celebrate("coinfly", { coin: payout.coins, origin });
  };

  const handleRejectPayout = async (payout: Payout): Promise<void> => {
    const ok = await payAction.run(() => rejectPayout(payout, uid));
    if (!ok) return;
    celebrate("quake");
  };

  const submitGrant = async (origin: DOMRect): Promise<void> => {
    const ok = await grantAction.run(() =>
      adjustCoins({
        householdId,
        memberId: grantMember,
        delta: grantDelta,
        reason: grantReason,
        note: grantNote.trim() || undefined,
        actorUid: uid,
      }),
    );
    if (!ok) return;
    if (grantDelta > 0) celebrate("coinfly", { coin: grantDelta, origin });
    setGrantOpen(false);
    setGrantText("1");
    setGrantNote("");
  };

  const stepGrant = (direction: 1 | -1): void => {
    const next = grantDelta + direction;
    // Zero is not a movement: stepping over it lands on the other side.
    setGrantText(
      String(grantDeltaOf(next === 0 ? direction : next, grantReason)),
    );
  };

  const payoutRow = (payout: Payout): JSX.Element => {
    const member = memberOf(payout.memberId);
    const waiting = payout.status === "requested";
    return (
      <li
        key={payout.id}
        className="rounded-card border border-rule bg-panel p-3"
      >
        <div className="flex items-center gap-3">
          {member ? <Avatar info={member.info} size="sm" /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">
              {nameOf(payout.memberId)}
            </p>
            <p className="text-xs tabular-nums text-muted">
              {requestedDate(payout)}
            </p>
          </div>
          <CoinAmount coins={payout.coins} yen={payout.yen} size="sm" />
        </div>

        {payout.note ? (
          <p className="mt-1 text-sm text-muted">{payout.note}</p>
        ) : null}

        <div className="mt-2 flex items-center gap-2">
          {waiting ? (
            <Badge tone="wait">まってるよ</Badge>
          ) : payout.status === "paid" ? (
            <Badge tone="done">わたした</Badge>
          ) : (
            <Badge tone="neutral">またこんど</Badge>
          )}

          {waiting && isParent ? (
            <>
              <Button
                variant="coin"
                size="md"
                className="flex-1"
                disabled={payAction.busy}
                onClick={(event) =>
                  void handlePay(
                    payout,
                    event.currentTarget.getBoundingClientRect(),
                  )
                }
              >
                しはらった
              </Button>
              <Button
                variant="ghost"
                size="md"
                disabled={payAction.busy}
                onClick={() => void handleRejectPayout(payout)}
              >
                ことわる
              </Button>
            </>
          ) : null}
        </div>
      </li>
    );
  };

  const ledgerRow = (row: LedgerEntry): JSX.Element => {
    // Spending is not a mistake, so a negative row is quiet, never `late`.
    const gained = row.delta > 0;
    return (
      <li
        key={row.id}
        className={`flex items-center gap-3 border-l-4 pl-3 ${
          gained ? "border-coin" : "border-muted/40"
        }`}
      >
        <div className="min-w-0 flex-1 py-2">
          <p
            className={`truncate text-sm font-bold ${
              gained ? "text-ink" : "text-muted"
            }`}
          >
            {REASON_JA[row.reason]}
            {ledgerFilter === "all" ? ` · ${nameOf(row.memberId)}` : ""}
          </p>
          {row.note ? (
            <p className="truncate text-xs text-muted">{row.note}</p>
          ) : null}
          <p className="text-xs tabular-nums text-muted">
            {formatDateJa(dateKeyOf(row.createdAt.toDate()))}
          </p>
        </div>
        <CoinAmount coins={row.delta} signed size="sm" />
      </li>
    );
  };

  return (
    <div className="space-y-4 px-3 py-4">
      <Card>
        <h2 className="text-base font-bold text-ink">あなたの コイン</h2>
        {balances.loading ? (
          <Skeleton rows={1} className="mt-3" />
        ) : (
          <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
            <CoinAmount coins={myCoins} yen={myCoins * coinYen} size="lg" />
            <p className="text-sm text-muted">
              これまでに {myEarned}コイン あつめた
            </p>
          </div>
        )}
      </Card>

      {isParent ? (
        <section aria-label="しょうにんまち" className="space-y-2">
          {pending.loading ? (
            <Skeleton rows={2} />
          ) : (
            <ApprovalQueue
              entries={pending.data}
              members={members}
              coinYen={coinYen}
              onApprove={handleApprove}
              onReject={(entry) => setRejectingEntry(entry)}
              onOpenComments={(entry) => setCommentsEntry(entry)}
            />
          )}
          {approveAction.error ? (
            <p role="alert">
              <Badge tone="late">{approveAction.error}</Badge>
            </p>
          ) : null}
        </section>
      ) : null}

      <Card>
        <h2 className="text-base font-bold text-ink">かぞくの コイン</h2>
        {balances.loading ? (
          <Skeleton rows={3} className="mt-3" />
        ) : (
          <ul className="mt-2 space-y-2">
            {board.map(({ member, coins }) => (
              <li key={member.uid} className="flex items-center gap-3">
                <Avatar info={member.info} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">
                    {member.info.displayName}
                  </p>
                  {member.uid === uid ? (
                    <Badge tone="self">あなた</Badge>
                  ) : null}
                </div>
                <CoinAmount coins={coins} yen={coins * coinYen} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-bold text-ink">おこづかいに かえる</h2>
        <p className="mt-1 text-sm text-muted">
          1コインは {coinYen}円。おうちのひとが わたしてくれるよ。
        </p>
        <Button
          variant="coin"
          block
          className="mt-3"
          disabled={myCoins <= 0}
          onClick={() => setPayoutOpen(true)}
        >
          こうかんを おねがいする
        </Button>
        {myCoins <= 0 ? (
          <p className="mt-2 text-sm text-muted">
            コインが たまったら かえられます
          </p>
        ) : null}
      </Card>

      <section aria-label="こうかんの おねがい">
        <h2 className="mb-2 text-base font-bold text-ink">
          こうかんの おねがい
        </h2>
        {payouts.loading ? (
          <Skeleton rows={2} />
        ) : openPayouts.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              title="いまは おねがいが ないよ"
              hint="コインを おこづかいに かえられるよ"
              emoji="🐷"
            />
          </Card>
        ) : (
          <ul className="space-y-2">{openPayouts.map(payoutRow)}</ul>
        )}

        {payAction.error ? (
          <p className="mt-2" role="alert">
            <Badge tone="late">{payAction.error}</Badge>
          </p>
        ) : null}

        {donePayouts.length > 0 ? (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="md"
              block
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              すんだ もの（{donePayouts.length}）{historyOpen ? " ▲" : " ▼"}
            </Button>
            {historyOpen ? (
              <ul className="mt-2 space-y-2">{donePayouts.map(payoutRow)}</ul>
            ) : null}
          </div>
        ) : null}
      </section>

      {isParent ? (
        <Card>
          <h2 className="text-base font-bold text-ink">コインを あげる</h2>
          <p className="mt-1 text-sm text-muted">
            ごほうびを たしたり、まちがいを なおしたり できます。
          </p>
          <Button
            variant="coin"
            block
            className="mt-3"
            onClick={() => setGrantOpen(true)}
          >
            コインを うごかす
          </Button>
        </Card>
      ) : null}

      <section aria-label="こうもく">
        <h2 className="mb-2 text-base font-bold text-ink">こうもく</h2>
        <div className="mb-2 overflow-x-auto pb-1">
          <SegmentedControl
            label="だれの こうもくを みる"
            name="ledger-filter"
            value={ledgerFilter}
            onChange={setLedgerFilter}
            options={[
              { value: "all", label: "みんな" },
              ...members.map((member) => ({
                value: member.uid,
                label: member.info.displayName,
              })),
            ]}
          />
        </div>

        <Card padded={ledger.data.length > 0}>
          {ledger.loading ? (
            <Skeleton rows={4} />
          ) : ledger.data.length === 0 ? (
            <EmptyState
              title="まだ こうもくが ありません"
              hint="コインが うごくと ここに でるよ"
              emoji="📒"
            />
          ) : (
            <ul className="space-y-2">{ledger.data.map(ledgerRow)}</ul>
          )}
        </Card>
      </section>

      <Sheet
        open={payoutOpen}
        onClose={() => setPayoutOpen(false)}
        title="おこづかいに かえる"
        footer={
          <Button
            variant="coin"
            block
            disabled={payoutAction.busy || myCoins <= 0}
            onClick={() => void submitPayout()}
          >
            {payoutCoins}コインを おねがいする
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="なんコイン かえる？" group>
            <div className="flex items-center justify-center gap-4">
              <IconButton
                label="1へらす"
                disabled={payoutCoins <= 1}
                onClick={() => setPayoutDraft(payoutCoins - 1)}
              >
                −
              </IconButton>
              <span
                aria-live="polite"
                className="min-w-[4rem] text-center text-3xl font-bold tabular-nums text-ink"
              >
                {payoutCoins}
              </span>
              <IconButton
                label="1ふやす"
                disabled={payoutCoins >= myCoins}
                onClick={() => setPayoutDraft(payoutCoins + 1)}
              >
                ＋
              </IconButton>
            </div>
          </Field>

          <div className="flex flex-wrap justify-center gap-2">
            <Chip
              tone="coin"
              selected={payoutCoins === myCoins}
              onClick={() => setPayoutDraft(myCoins)}
            >
              ぜんぶ
            </Chip>
            {QUICK_COINS.filter((amount) => amount <= myCoins).map((amount) => (
              <Chip
                key={amount}
                tone="coin"
                selected={payoutCoins === amount}
                onClick={() => setPayoutDraft(amount)}
              >
                {amount}
              </Chip>
            ))}
          </div>

          <p className="text-center text-base font-bold tabular-nums text-ink">
            {payoutYen}円 に なります
          </p>

          <Field label="ひとこと（なくても いいよ）">
            <Input
              value={payoutNote}
              onChange={(event) => setPayoutNote(event.target.value)}
              placeholder="なにに つかう？"
            />
          </Field>

          {payoutAction.error ? (
            <p role="alert">
              <Badge tone="late">{payoutAction.error}</Badge>
            </p>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        title="コインを あげる"
        footer={
          <Button
            variant="coin"
            block
            disabled={grantAction.busy || grantDelta === 0 || !grantMember}
            onClick={(event) =>
              void submitGrant(event.currentTarget.getBoundingClientRect())
            }
          >
            {grantDelta > 0 ? `${grantDelta}コイン あげる` : null}
            {grantDelta < 0 ? `${-grantDelta}コイン へらす` : null}
            {grantDelta === 0 ? "かずを えらんでね" : null}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="だれに">
            <Select
              value={grantMember}
              onChange={(event) => setGrantMemberId(event.target.value)}
            >
              {members.map((member) => (
                <option key={member.uid} value={member.uid}>
                  {member.info.displayName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="りゆう" group>
            <SegmentedControl
              label="りゆう"
              name="grant-reason"
              value={grantReason}
              onChange={(next) => setGrantReason(next)}
              options={GRANT_OPTIONS}
              className="w-full"
            />
          </Field>

          <Field
            label="なんコイン"
            group
            hint={
              grantReason === "bonus"
                ? "1から999まで"
                : "へらすときは マイナスに してね"
            }
          >
            <div className="flex items-center gap-2">
              <IconButton
                label="1へらす"
                disabled={
                  grantReason === "bonus"
                    ? grantDelta <= 1
                    : grantDelta <= -GRANT_LIMIT
                }
                onClick={() => stepGrant(-1)}
              >
                −
              </IconButton>
              <Input
                // `bonus` never needs a minus sign, so it keeps the numeric
                // keypad; `adjust` has to be able to type one.
                inputMode={grantReason === "bonus" ? "numeric" : "text"}
                className="text-center text-lg font-bold tabular-nums"
                aria-label="コインの かず"
                value={grantText}
                onChange={(event) => setGrantText(event.target.value)}
              />
              <IconButton
                label="1ふやす"
                disabled={grantDelta >= GRANT_LIMIT}
                onClick={() => stepGrant(1)}
              >
                ＋
              </IconButton>
            </div>
          </Field>

          <p className="text-sm text-muted">
            {grantDelta === 0
              ? "0いがいの かずを いれてね"
              : `${nameOf(grantMember)}の コインが ${
                  grantDelta > 0 ? "ふえます" : "へります"
                }（${Math.abs(grantDelta) * coinYen}円ぶん）`}
          </p>

          <Field label="メモ（なくても いいよ）">
            <Input
              value={grantNote}
              onChange={(event) => setGrantNote(event.target.value)}
              placeholder="おてつだい ありがとう"
            />
          </Field>

          {grantAction.error ? (
            <p role="alert">
              <Badge tone="late">{grantAction.error}</Badge>
            </p>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={rejectingEntry !== null}
        onClose={() => setRejectingEntry(null)}
        title="みなおしの りゆう"
        footer={
          <Button
            block
            disabled={rejectAction.busy}
            onClick={() => void submitReject()}
          >
            みなおしに する
          </Button>
        }
      >
        <p className="mb-2 text-sm text-muted">
          コインは うごきません。やさしく つたえよう。
        </p>
        <Textarea
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
          placeholder="またこんど やろうね"
          aria-label="みなおしの りゆう"
        />
        {rejectAction.error ? (
          <p className="mt-2" role="alert">
            <Badge tone="late">{rejectAction.error}</Badge>
          </p>
        ) : null}
      </Sheet>

      <Sheet
        open={commentsEntry !== null}
        onClose={() => setCommentsEntry(null)}
        title="コメント"
      >
        {commentsEntry ? (
          <CommentThread
            entry={commentsEntry}
            members={members}
            currentUid={uid}
            canModerate={isParent}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
