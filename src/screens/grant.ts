import type { LedgerReason } from "../types";

export type GrantReason = Extract<LedgerReason, "bonus" | "adjust">;

export const GRANT_LIMIT = 10000;

/** Whole coins only, inside the limit; `bonus` can never take coins away. */
export function grantDeltaOf(raw: number, reason: GrantReason): number {
  const whole = Number.isFinite(raw) ? Math.trunc(raw) : 0;
  const bounded = Math.max(-GRANT_LIMIT, Math.min(GRANT_LIMIT, whole));
  return reason === "bonus" ? Math.max(0, bounded) : bounded;
}
