import { describe, expect, it } from "vitest";

import { GRANT_LIMIT, grantDeltaOf } from "./grant";

describe("grantDeltaOf", () => {
  it("passes the limit through unchanged", () => {
    expect(GRANT_LIMIT).toBe(10000);
    expect(grantDeltaOf(10000, "adjust")).toBe(10000);
    expect(grantDeltaOf(-10000, "adjust")).toBe(-10000);
  });

  it("clamps beyond the limit", () => {
    expect(grantDeltaOf(10001, "adjust")).toBe(10000);
    expect(grantDeltaOf(99999, "bonus")).toBe(10000);
    expect(grantDeltaOf(-10001, "adjust")).toBe(-10000);
  });

  it("keeps small and former-limit values", () => {
    expect(grantDeltaOf(0, "adjust")).toBe(0);
    expect(grantDeltaOf(1, "adjust")).toBe(1);
    expect(grantDeltaOf(-1, "adjust")).toBe(-1);
    expect(grantDeltaOf(999, "bonus")).toBe(999);
    expect(grantDeltaOf(1000, "bonus")).toBe(1000);
  });

  it("never takes coins away on a bonus", () => {
    expect(grantDeltaOf(-5, "bonus")).toBe(0);
    expect(grantDeltaOf(-10000, "bonus")).toBe(0);
  });

  it("treats NaN as 0 and truncates fractions", () => {
    expect(grantDeltaOf(Number.NaN, "adjust")).toBe(0);
    expect(grantDeltaOf(2.9, "adjust")).toBe(2);
    expect(grantDeltaOf(-2.9, "adjust")).toBe(-2);
  });
});
