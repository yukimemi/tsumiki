import { describe, it, expect } from "vitest";
import { isAdminEmail } from "./admin";

describe("isAdminEmail", () => {
  it("recognises an allowlisted address", () => {
    expect(isAdminEmail("yukimemi@gmail.com")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isAdminEmail("YukiMemi@Gmail.com")).toBe(true);
  });

  it("rejects an address not on the list", () => {
    expect(isAdminEmail("stranger@example.com")).toBe(false);
  });

  it("rejects null, undefined, and empty input", () => {
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });
});
