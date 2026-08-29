import { describe, expect, it } from "vitest";
import decideModule from "./decide.js";

const { decide } = decideModule;

const LINKED = true;
const UNLINKED = false;

describe("decide", () => {
  it("does nothing while spend is below the budget", () => {
    expect(decide({ costAmount: 12, budgetAmount: 1000 }, LINKED)).toBe(
      "under-budget",
    );
  });

  it("treats a missing costAmount as nothing spent yet", () => {
    expect(decide({ budgetAmount: 1000 }, LINKED)).toBe("under-budget");
  });

  // The 100% threshold rule is what publishes the notification that matters,
  // so equality has to fire or the last rule is decorative.
  it("fires at exactly the budget", () => {
    expect(decide({ costAmount: 1000, budgetAmount: 1000 }, LINKED)).toBe(
      "disable",
    );
  });

  it("fires above the budget", () => {
    expect(decide({ costAmount: 1001, budgetAmount: 1000 }, LINKED)).toBe(
      "disable",
    );
  });

  it("stays quiet once billing is already unlinked", () => {
    expect(decide({ costAmount: 5000, budgetAmount: 1000 }, UNLINKED)).toBe(
      "already-disabled",
    );
  });

  // A garbled message must not become an outage.
  it("refuses to fire on a missing budget", () => {
    expect(decide({ costAmount: 5000 }, LINKED)).toBe("under-budget");
  });

  it("refuses to fire on a zero budget", () => {
    expect(decide({ costAmount: 5000, budgetAmount: 0 }, LINKED)).toBe(
      "under-budget",
    );
  });

  it("refuses to fire on unparseable amounts", () => {
    expect(decide({ costAmount: "lots", budgetAmount: 1000 }, LINKED)).toBe(
      "under-budget",
    );
    expect(decide({ costAmount: 5000, budgetAmount: "some" }, LINKED)).toBe(
      "under-budget",
    );
  });

  it("survives an empty payload", () => {
    expect(decide({}, LINKED)).toBe("under-budget");
    expect(decide(undefined, LINKED)).toBe("under-budget");
  });
});
