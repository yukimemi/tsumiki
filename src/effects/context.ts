import { createContext, useContext } from "react";

import type { CelebrationKind } from "./effects";

export type CelebrateOptions = {
  /** Coins earned, for `coinfly`. The figure shown is the real number. */
  coin?: number;
  /** Where on screen the effect started — usually the tapped row's rect. */
  origin?: DOMRect | null;
};

export type EffectsState = {
  celebrate(kind: CelebrationKind, options?: CelebrateOptions): void;
  /** Completions inside COMBO_WINDOW_MS, clamped at COMBO_CAP. 0 = none. */
  combo: number;
};

/**
 * The default is inert rather than a thrown error.
 *
 * Every other context in this app throws when it is used outside its
 * provider, because a screen that cannot see the household or the signed
 * in user is broken. Confetti is not that: a component rendered outside
 * the provider — a sheet in a portal, a screen under test — should keep
 * working silently rather than take the page down over decoration.
 */
const INERT: EffectsState = {
  celebrate: () => {},
  combo: 0,
};

export const EffectsContext = createContext<EffectsState>(INERT);

export function useEffects(): EffectsState {
  return useContext(EffectsContext);
}
