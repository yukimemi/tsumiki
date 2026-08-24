// @vitest-environment jsdom
//
// The tone rules in CoinRanking are the point of the component, not a detail
// of it: a board that quietly starts naming a last place, or that drops the
// child on zero, is a regression however well it renders.

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CoinRanking } from "./CoinRanking";
import type { HouseholdMember } from "../household/context";
import { rankByCoins } from "../screens/ranking";

function member(uid: string, displayName: string): HouseholdMember {
  return {
    uid,
    role: "child",
    info: { displayName, color: "sakura", emoji: "🐶" },
  };
}

const MEMBERS = [member("a", "あお"), member("b", "みどり"), member("c", "きい")];

afterEach(() => {
  document.body.innerHTML = "";
});

function board(coins: Record<string, number>, currentUid = "a") {
  return render(
    <CoinRanking
      rows={rankByCoins(MEMBERS.map((m) => ({ memberId: m.uid, coins: coins[m.uid] ?? 0 })))}
      members={MEMBERS}
      currentUid={currentUid}
      period="week"
      onPeriod={() => {}}
    />,
  );
}

describe("CoinRanking", () => {
  it("names the leader and gives everyone else the gap to catch up", () => {
    board({ a: 20, b: 12, c: 0 });
    expect(screen.getByText("いま トップ！")).toBeTruthy();
    expect(screen.getByText("あと 8コインで おいつくよ")).toBeTruthy();
    expect(screen.getByText("あと 12コインで おいつくよ")).toBeTruthy();
  });

  it("keeps the member on zero on the board", () => {
    board({ a: 20, b: 12, c: 0 });
    expect(screen.getByText("きい")).toBeTruthy();
  });

  it("never labels anyone last, or measures against the leader", () => {
    board({ a: 20, b: 12, c: 0 });
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/さいか|びり|さいご/);
    // 20 - 0 would be the distance from the leader; only 12, the gap to the
    // rank above, may appear on the bottom row.
    expect(text).not.toContain("あと 20コイン");
  });

  it("marks your own row", () => {
    board({ a: 20, b: 12, c: 0 }, "b");
    expect(screen.getAllByText("あなた")).toHaveLength(1);
  });

  it("says nobody has started rather than handing out a medal for zero", () => {
    board({});
    expect(screen.getByText("まだ だれも あつめてないよ")).toBeTruthy();
    expect(screen.queryByText("いま トップ！")).toBeNull();
  });
});
