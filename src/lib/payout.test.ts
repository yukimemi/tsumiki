import { describe, expect, it } from "vitest";

import { clampToPlan, payoutPlan } from "./payout";

describe("payoutPlan", () => {
  it("leaves every whole coin available when no rule is set", () => {
    const plan = payoutPlan({ balanceCoins: 7, coinYen: 10 });
    expect(plan).toEqual({
      stepCoins: 1,
      minCoins: 1,
      maxCoins: 7,
      canRequest: true,
    });
  });

  it("turns a 50 yen step into a 5 coin step at 10 yen a coin", () => {
    const plan = payoutPlan({
      balanceCoins: 23,
      coinYen: 10,
      minYen: 50,
      stepYen: 50,
    });
    expect(plan.stepCoins).toBe(5);
    expect(plan.minCoins).toBe(5);
    // 23 coins is 230 yen; the largest amount on a step is 20 coins / 200 yen.
    expect(plan.maxCoins).toBe(20);
    expect(plan.canRequest).toBe(true);
  });

  it("refuses a balance that cannot reach the minimum", () => {
    const plan = payoutPlan({
      balanceCoins: 4,
      coinYen: 10,
      minYen: 50,
      stepYen: 50,
    });
    expect(plan.canRequest).toBe(false);
    expect(plan.maxCoins).toBe(0);
  });

  it("rounds a minimum that falls between steps up onto one", () => {
    // 30 yen floor with 50 yen steps: 3 coins clears the floor but is not a
    // step, so the real minimum is 5 coins.
    const plan = payoutPlan({
      balanceCoins: 100,
      coinYen: 10,
      minYen: 30,
      stepYen: 50,
    });
    expect(plan.minCoins).toBe(5);
  });

  it("handles a coin value that does not divide the step", () => {
    // 3 and 50 share no factor, so only multiples of 50 coins land on a step.
    const plan = payoutPlan({
      balanceCoins: 200,
      coinYen: 3,
      minYen: 50,
      stepYen: 50,
    });
    expect(plan.stepCoins).toBe(50);
    expect(plan.minCoins).toBe(50);
    expect(plan.maxCoins).toBe(200);
  });

  it("applies a minimum with no step", () => {
    const plan = payoutPlan({ balanceCoins: 9, coinYen: 10, minYen: 50 });
    expect(plan.stepCoins).toBe(1);
    expect(plan.minCoins).toBe(5);
    expect(plan.maxCoins).toBe(9);
  });

  it("ignores yen rules when a coin is worth nothing", () => {
    const plan = payoutPlan({
      balanceCoins: 12,
      coinYen: 0,
      minYen: 50,
      stepYen: 50,
    });
    expect(plan.stepCoins).toBe(1);
    expect(plan.minCoins).toBe(1);
    expect(plan.maxCoins).toBe(12);
  });

  it("cannot request anything on an empty balance", () => {
    expect(payoutPlan({ balanceCoins: 0, coinYen: 10 }).canRequest).toBe(false);
  });
});

describe("clampToPlan", () => {
  const plan = payoutPlan({
    balanceCoins: 23,
    coinYen: 10,
    minYen: 50,
    stepYen: 50,
  });

  it("snaps to the nearest step", () => {
    expect(clampToPlan(7, plan)).toBe(5);
    expect(clampToPlan(8, plan)).toBe(10);
  });

  it("never goes below the minimum or above what the balance covers", () => {
    expect(clampToPlan(1, plan)).toBe(5);
    expect(clampToPlan(999, plan)).toBe(20);
  });

  it("returns zero when nothing can be requested", () => {
    const broke = payoutPlan({
      balanceCoins: 2,
      coinYen: 10,
      minYen: 50,
      stepYen: 50,
    });
    expect(clampToPlan(50, broke)).toBe(0);
  });
});
