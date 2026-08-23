import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { EffectsContext } from "./context";
import type { CelebrateOptions, EffectsState } from "./context";
import {
  BURST_MS,
  COINFLY_MS,
  COMBO_CAP,
  COMBO_WINDOW_MS,
  POP_MS,
  QUAKE_CLASSES,
  QUAKE_MS,
} from "./effects";
import type { CelebrationKind } from "./effects";
import { COIN_STAGGER_MS, EffectsLayer, MAX_COIN_GLYPHS } from "./EffectsLayer";
import type { CoinFlight, PopMark } from "./EffectsLayer";

/**
 * The single kill switch.
 *
 * `--fx` is a multiplier the stylesheet owns: 1 normally, 2 under
 * matsuri, and 0 for both `data-motion="calm"` and
 * `prefers-reduced-motion: reduce`. Asking CSS for the resolved value
 * means the two ways of saying "no" are answered in one place, and a
 * component never has to check either of them itself.
 *
 * A missing property parses to NaN — no stylesheet, so no effects.
 */
function fxLevel(): number {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    "--fx",
  );
  const level = Number.parseFloat(raw);
  return Number.isFinite(level) ? level : 0;
}

export function EffectsProvider({ children }: { children: ReactNode }) {
  const [bursts, setBursts] = useState<number[]>([]);
  const [flights, setFlights] = useState<CoinFlight[]>([]);
  const [marks, setMarks] = useState<PopMark[]>([]);
  const [combo, setCombo] = useState(0);

  const seq = useRef(0);
  const timers = useRef<Set<number>>(new Set());
  const comboTimer = useRef(0);
  const comboCount = useRef(0);
  const quakeSide = useRef(0);

  // Every removal is a timeout, and every timeout is in this set, so
  // unmounting cannot leave a node on screen or a callback pointed at a
  // gone component.
  const after = useCallback((ms: number, run: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      run();
    }, ms);
    timers.current.add(id);
  }, []);

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const id of running) window.clearTimeout(id);
      running.clear();
      window.clearTimeout(comboTimer.current);
      document.documentElement.classList.remove(
        QUAKE_CLASSES[0],
        QUAKE_CLASSES[1],
      );
    };
  }, []);

  const celebrate = useCallback(
    (kind: CelebrationKind, options?: CelebrateOptions) => {
      if (fxLevel() <= 0) return;

      const root = document.documentElement;
      const id = (seq.current += 1);

      switch (kind) {
        case "stack": {
          // The block itself is drawn by the row, which carries
          // `.tsu-stack` for as long as it wants to. What only this
          // provider can see is that four rows were tapped in a row —
          // and completion is the one event that always fires `stack`,
          // so counting here cannot double-count a single task.
          comboCount.current = Math.min(comboCount.current + 1, COMBO_CAP);
          setCombo(comboCount.current);
          window.clearTimeout(comboTimer.current);
          comboTimer.current = window.setTimeout(() => {
            comboCount.current = 0;
            setCombo(0);
          }, COMBO_WINDOW_MS);
          return;
        }

        case "coinfly": {
          const coin = Math.max(1, Math.round(options?.coin ?? 1));
          const glyphs = Math.min(coin, MAX_COIN_GLYPHS);
          const rect = options?.origin ?? null;
          const from = rect
            ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
            : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

          // The balance badge in the header if the shell is up, the top
          // right corner if a screen fired this from outside it.
          const badge = document
            .getElementById("coin-target")
            ?.getBoundingClientRect();
          const to =
            badge && badge.width > 0
              ? {
                  x: badge.left + badge.width / 2,
                  y: badge.top + badge.height / 2,
                }
              : { x: window.innerWidth - 44, y: 28 };

          setFlights((current) => [
            ...current,
            {
              id,
              coin,
              glyphs,
              x: from.x,
              y: from.y,
              dx: to.x - from.x,
              dy: to.y - from.y,
            },
          ]);
          after(COINFLY_MS + (glyphs - 1) * COIN_STAGGER_MS + 80, () => {
            setFlights((current) => current.filter((f) => f.id !== id));
          });
          return;
        }

        case "burst": {
          // Gated here as well as in CSS: outside matsuri there is
          // nothing to animate, so there is no reason to mount a
          // full-screen node for 420ms.
          if (root.dataset.theme !== "matsuri") return;
          setBursts((current) => [...current, id]);
          after(BURST_MS + 40, () => {
            setBursts((current) => current.filter((b) => b !== id));
          });
          return;
        }

        case "quake": {
          root.classList.remove(QUAKE_CLASSES[0], QUAKE_CLASSES[1]);
          const side = QUAKE_CLASSES[quakeSide.current];
          quakeSide.current = quakeSide.current === 0 ? 1 : 0;
          root.classList.add(side);
          after(QUAKE_MS, () => root.classList.remove(side));
          return;
        }

        case "pop": {
          const rect = options?.origin ?? null;
          if (!rect) return;
          setMarks((current) => [
            ...current,
            {
              id,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            },
          ]);
          after(POP_MS + 40, () => {
            setMarks((current) => current.filter((m) => m.id !== id));
          });
          return;
        }
      }
    },
    [after],
  );

  const value = useMemo<EffectsState>(
    () => ({ celebrate, combo }),
    [celebrate, combo],
  );

  return (
    <EffectsContext.Provider value={value}>
      {children}
      <EffectsLayer
        bursts={bursts}
        flights={flights}
        marks={marks}
        combo={combo}
      />
    </EffectsContext.Provider>
  );
}
