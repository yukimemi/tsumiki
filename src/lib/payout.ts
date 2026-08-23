/**
 * What a member is allowed to exchange, given the household's rules.
 *
 * A parent thinks in yen — "from 50 yen, in 50 yen steps" — but the ledger is
 * in coins, and only whole coins exist. So the yen rules have to be translated
 * into a coin step, and that translation is the only interesting part here.
 *
 * With a 10 yen coin and a 50 yen step, 5 coins is the smallest amount that
 * lands exactly on a step, so the stepper moves 5 coins at a time. With a 3 yen
 * coin the smallest is 50 coins, because 3 and 50 share no factor — unusual,
 * but the arithmetic is honest and the UI shows the resulting figures rather
 * than the rule.
 */

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

export type PayoutPlan = {
  /** Coins per notch on the stepper. Always at least 1. */
  stepCoins: number;
  /** Smallest allowed request, already rounded onto a step. */
  minCoins: number;
  /** Largest allowed request that the balance covers. 0 when none does. */
  maxCoins: number;
  /** False when the balance cannot reach `minCoins`. */
  canRequest: boolean;
};

export function payoutPlan(input: {
  balanceCoins: number;
  coinYen: number;
  /** 0 or missing means no minimum. */
  minYen?: number;
  /** 0 or missing means any whole number of coins. */
  stepYen?: number;
}): PayoutPlan {
  const { balanceCoins, coinYen } = input;
  const minYen = Math.max(0, Math.floor(input.minYen ?? 0));
  const stepYen = Math.max(0, Math.floor(input.stepYen ?? 0));

  // A coin worth nothing cannot be converted to a yen rule at all, so the
  // household's yen constraints simply do not apply.
  const usable = coinYen > 0;

  const stepCoins =
    usable && stepYen > 0 ? stepYen / gcd(coinYen, stepYen) : 1;

  const rawMin = usable && minYen > 0 ? Math.ceil(minYen / coinYen) : 1;
  // Round the minimum up onto a step: a floor of 50 yen with 50 yen steps must
  // not produce an amount that clears the floor but sits between steps.
  const minCoins = Math.max(
    stepCoins,
    Math.ceil(rawMin / stepCoins) * stepCoins,
  );

  const maxCoins = Math.floor(balanceCoins / stepCoins) * stepCoins;

  return {
    stepCoins,
    minCoins,
    maxCoins: maxCoins >= minCoins ? maxCoins : 0,
    canRequest: maxCoins >= minCoins,
  };
}

/** Snap an arbitrary figure onto the plan, for a stepper or a quick amount. */
export function clampToPlan(coins: number, plan: PayoutPlan): number {
  if (!plan.canRequest) return 0;
  const snapped = Math.round(coins / plan.stepCoins) * plan.stepCoins;
  return Math.min(Math.max(snapped, plan.minCoins), plan.maxCoins);
}
