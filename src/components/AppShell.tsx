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
 * How much of the visual viewport the keyboard has to swallow before we
 * believe it. Browser chrome sliding in and out moves this by a little; a
 * software keyboard takes a third of the screen or more.
 */
const KEYBOARD_MIN_RATIO = 0.25;

/**
 * True while the software keyboard is actually covering the screen.
 *
 * This asks the visual viewport rather than asking who has focus, and that
 * distinction is the whole point. Focus is a latch: dismissing the keyboard
 * with Android's back gesture leaves the field focused, so a focus-driven
 * check stays true after the keyboard is gone and the five tabs never come
 * back — which is exactly how the nav went missing in the installed PWA.
 * Viewport height is not a latch. It reports what is on screen right now,
 * and every route back to a full-height viewport fires `resize`.
 *
 * It also fails in the safe direction: no `visualViewport`, no hiding.
 */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const sync = () => {
      const hidden = window.innerHeight - viewport.height;
      const covered = hidden > window.innerHeight * KEYBOARD_MIN_RATIO;
      // A shrunken viewport with nothing focused is a browser-UI artefact,
      // not a keyboard, so both have to agree before the nav stands down.
      setOpen(covered && isTextual(document.activeElement));
    };

    viewport.addEventListener("resize", sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
    };
  }, []);

  return open;
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
  const keyboardOpen = useKeyboardOpen();

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

      {keyboardOpen ? null : (
        <BottomNav pendingCount={isParent ? pending.data.length : 0} />
      )}
    </div>
  );
}
