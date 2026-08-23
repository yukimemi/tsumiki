import { NavLink } from "react-router-dom";

import { Badge } from "./ui";

/**
 * The five screens, in the order a day goes: what to do, who did it, what
 * it was worth, how it has been going, and the settings behind all of it.
 *
 * `NavLink` writes `aria-current="page"` on the active link itself, so the
 * colour change is decoration over a state a screen reader already has.
 */
const ITEMS: readonly {
  to: string;
  label: string;
  glyph: string;
  /** The approval queue lives on コイン, so that is where its count goes. */
  pending?: boolean;
}[] = [
  { to: "/", label: "きょう", glyph: "🧱" },
  { to: "/family", label: "みんな", glyph: "🧑‍🤝‍🧑" },
  { to: "/coins", label: "コイン", glyph: "🪙", pending: true },
  { to: "/records", label: "きろく", glyph: "📅" },
  { to: "/settings", label: "せってい", glyph: "⚙️" },
];

export function BottomNav({ pendingCount = 0 }: { pendingCount?: number }) {
  return (
    <nav
      aria-label="メインメニュー"
      className="safe-b sticky bottom-0 z-30 flex-none border-t border-rule bg-panel shadow-nav"
    >
      <ul className="flex h-nav items-stretch px-1">
        {ITEMS.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              // Without `end` the root path matches every route and every
              // tab lights up at once.
              end={item.to === "/"}
              className={({ isActive }) =>
                `relative flex h-full min-h-tap flex-col items-center justify-center gap-0.5 rounded-card text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-self ${
                  isActive ? "text-self" : "text-muted"
                }`
              }
            >
              {/* The badge hangs off the glyph, not off the link. The link is
                  `flex-1`, so on anything wider than a phone it stretches and
                  an `absolute right-*` badge drifts into the gap between two
                  tabs. Anchored here it stays on the icon at any width. */}
              <span className="relative inline-grid place-items-center">
                <span className="text-xl leading-none" aria-hidden="true">
                  {item.glyph}
                </span>
                {item.pending && pendingCount > 0 ? (
                  <span className="absolute -right-4 -top-1.5">
                    <Badge tone="wait" className="shadow-glow-wait">
                      {pendingCount}
                    </Badge>
                    <span className="sr-only">けんの しょうにんまち</span>
                  </span>
                ) : null}
              </span>
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
