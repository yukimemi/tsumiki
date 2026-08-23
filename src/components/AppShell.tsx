import { useEffect, useState, type ReactNode } from "react";

import { useUid } from "../auth/context";
import { balanceOf, useBalances } from "../data/coins";
import { usePendingEntries } from "../data/entries";
import { useHousehold } from "../household/context";
import { BottomNav } from "./BottomNav";
import { Avatar, CoinAmount } from "./ui";

/** Inputs that open a software keyboard. A radio or a checkbox does not. */
const TEXTUAL_INPUT: Record<string, true> = {
  text: true,
  search: true,
  email: true,
  url: true,
  tel: true,
  number: true,
  password: true,
  time: true,
  date: true,
};

function isTextual(node: Element | null): boolean {
  if (node instanceof HTMLTextAreaElement) return true;
  if (node instanceof HTMLInputElement) return TEXTUAL_INPUT[node.type] === true;
  return false;
}

/**
 * True while a field that raises the keyboard has focus.
 *
 * On a phone the five tabs are dead weight mid-sentence: they eat a row of
 * an already short viewport and, in browsers that shrink the layout viewport
 * for the keyboard, they ride up and sit on top of it. Standing the nav down
 * while typing is both the tidier layout and the cheaper fix.
 */
function useTypingFocus(): boolean {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    // `focusout` fires before the next element takes focus, so the answer is
    // only correct one task later.
    const sync = () => {
      queueMicrotask(() => setTyping(isTextual(document.activeElement)));
    };
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
    };
  }, []);

  return typing;
}

/**
 * The phone frame: a header that never scrolls, a body that does, and the
 * five tabs pinned to the bottom.
 *
 * The header fills itself. Everything it shows — the household's name, who
 * you are, what you are worth — comes out of context, so a screen has
 * nothing to hand up and there is no slot machinery to keep in step. The
 * one escape hatch is `right`, for a screen-level action that genuinely
 * belongs in the header; it is a plain prop rather than a portal or a
 * context because the shell is mounted once, around the router outlet, and
 * a prop is the whole of what that needs.
 *
 * `<span id="coin-target">` is load-bearing: it is what the coinfly
 * celebration aims earned coins at. Rename it and the coins fly to the
 * corner instead.
 */
export function AppShell({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  const uid = useUid();
  const { household, householdId, members, isParent } = useHousehold();
  const balances = useBalances(householdId);
  // Only a parent can act on the queue, so only a parent is told its size.
  const pending = usePendingEntries(isParent ? householdId : null);
  const typing = useTypingFocus();

  const me = members.find((member) => member.uid === uid) ?? null;
  const coins = balanceOf(balances.data, uid)?.coins ?? 0;
  const yen = household ? coins * household.coinYen : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="safe-t sticky top-0 z-20 flex-none border-b border-rule bg-panel/95 backdrop-blur">
        <div className="safe-x flex min-h-tap items-center gap-2 px-3 py-2">
          {me ? <Avatar info={me.info} size="sm" /> : null}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold leading-tight text-ink">
              {household ? household.name : "tsumiki"}
            </p>
            {me ? (
              <p className="truncate text-xs leading-tight text-muted">
                {me.info.displayName}
              </p>
            ) : null}
          </div>

          {right}

          <span id="coin-target" className="flex-none">
            <CoinAmount coins={coins} yen={yen} size="sm" />
          </span>
        </div>
      </header>

      <main className="pad-nav safe-x min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>

      {typing ? null : (
        <BottomNav pendingCount={isParent ? pending.data.length : 0} />
      )}
    </div>
  );
}
