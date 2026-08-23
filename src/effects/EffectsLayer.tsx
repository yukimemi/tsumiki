import type { CSSProperties } from "react";

import { COMBO_FLOOR } from "./effects";

/**
 * The one overlay every celebration is drawn into.
 *
 * Fixed, `pointer-events: none` and `aria-hidden`, mounted once by
 * EffectsProvider: nothing in here can be tapped, focused, read out, or
 * reached by the layout. Coordinates arrive in viewport space and are
 * used as-is, which is the whole reason the layer is `position: fixed`
 * with absolutely positioned children.
 */

/**
 * Eight is the most coins that read as coins.
 *
 * A 20-coin task would otherwise put twenty glyphs on a phone screen and
 * arrive as noise, so the glyphs are capped and the real figure rides
 * along as a label.
 */
export const MAX_COIN_GLYPHS = 8;

/** Gap between glyphs in one flight. Shared with the provider, which has
 * to know when the last one has landed before it unmounts the flight. */
export const COIN_STAGGER_MS = 45;

export type CoinFlight = {
  id: number;
  /** Coins actually earned — what the label says. */
  coin: number;
  /** Glyphs to draw: `coin`, capped at MAX_COIN_GLYPHS. */
  glyphs: number;
  /** Viewport-space start point. */
  x: number;
  y: number;
  /** Offset from the start point to the balance badge. */
  dx: number;
  dy: number;
};

export type PopMark = {
  id: number;
  x: number;
  y: number;
};

/** A completion that went to a parent instead of to the bank. */
export type WishMark = {
  id: number;
  x: number;
  y: number;
};

export type EffectsLayerProps = {
  bursts: readonly number[];
  flights: readonly CoinFlight[];
  marks: readonly PopMark[];
  wishes: readonly WishMark[];
  combo: number;
};

function Flight({ flight }: { flight: CoinFlight }) {
  const glyphs = [];
  for (let i = 0; i < flight.glyphs; i += 1) {
    // Fan the glyphs out of the row so they do not leave as one stack,
    // then aim every one of them at the same badge.
    const spread = ((i % 3) - 1) * 16;
    const lift = (i % 2 === 0 ? -1 : 1) * 9;
    glyphs.push(
      <span
        key={i}
        className="tsu-coin"
        style={
          {
            "--x": `${flight.x + spread}px`,
            "--y": `${flight.y + lift}px`,
            "--dx": `${flight.dx - spread}px`,
            "--dy": `${flight.dy - lift}px`,
            "--d": `${i * COIN_STAGGER_MS}ms`,
          } as CSSProperties
        }
      >
        🪙
      </span>,
    );
  }

  return (
    <>
      {glyphs}
      <span
        className="tsu-coin-label"
        style={
          {
            "--x": `${flight.x}px`,
            "--y": `${flight.y - 22}px`,
            "--dx": `${flight.dx}px`,
            "--dy": `${flight.dy}px`,
          } as CSSProperties
        }
      >
        +{flight.coin}
      </span>
    </>
  );
}

export function EffectsLayer({
  bursts,
  flights,
  marks,
  wishes,
  combo,
}: EffectsLayerProps) {
  return (
    <div className="tsu-layer" aria-hidden="true">
      {bursts.map((id) => (
        <div key={id} className="tsu-burst" />
      ))}

      {flights.map((flight) => (
        <Flight key={flight.id} flight={flight} />
      ))}

      {marks.map((mark) => (
        <span
          key={mark.id}
          className="tsu-mark"
          style={
            { "--x": `${mark.x}px`, "--y": `${mark.y}px` } as CSSProperties
          }
        >
          ✓
        </span>
      ))}

      {wishes.map((wish) => (
        <span
          key={wish.id}
          className="tsu-wish"
          style={
            { "--x": `${wish.x}px`, "--y": `${wish.y}px` } as CSSProperties
          }
        >
          <span className="tsu-wish-glyph">🙏</span>
          <span className="tsu-wish-word">おねがい！</span>
        </span>
      ))}

      {/* Keyed on the count so each bump remounts the node and restarts
          the animation — a run of five is five hits, not one that grew. */}
      {combo >= COMBO_FLOOR ? (
        <div key={combo} className="tsu-combo">
          ×{combo}
          <small>れんぞく！</small>
        </div>
      ) : null}
    </div>
  );
}
