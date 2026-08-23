/**
 * The celebration catalog, as numbers.
 *
 * Every duration here has a twin in src/index.css — the keyframe that
 * draws the effect — and the provider's removal timer is the reason the
 * numbers have to live in TypeScript at all: an overlay node is taken off
 * by a timeout rather than by `animationend`, because reduced motion
 * silences the animation and that event would then never arrive, leaving
 * the node on screen forever.
 */

/** Task completed: a block lands on the row. */
export const STACK_MS = 320;

/** Coins earned: they fly from the row to the balance badge. */
export const COINFLY_MS = 700;

/** matsuri only: a full-screen shockwave. */
export const BURST_MS = 420;

/** Undo or reject: the shell takes the recoil. */
export const QUAKE_MS = 240;

/** Approved: the waiting badge pops and turns --done. */
export const POP_MS = 260;

/** How long a run of completions stays a run. */
export const COMBO_WINDOW_MS = 1600;

/** Two in a row is the smallest thing worth calling a combo. */
export const COMBO_FLOOR = 2;

/** Past this the number stops being fun and starts being a claim. */
export const COMBO_CAP = 30;

/**
 * The shake, spelled twice.
 *
 * A second undo inside 240ms has to shake again, and re-adding a class
 * the element already carries restarts nothing. So the provider
 * alternates between these two names, which are the same animation under
 * different identities.
 */
export const QUAKE_CLASSES: readonly [string, string] = [
  "tsu-quake-a",
  "tsu-quake-b",
];

export type CelebrationKind = "stack" | "coinfly" | "burst" | "quake" | "pop";
