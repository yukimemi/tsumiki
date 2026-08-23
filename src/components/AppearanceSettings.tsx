// Theme and motion. Two axes, never folded into one switch: "matsuri" is a
// palette, "calm" is a volume knob, and a child who likes the festival colours
// should not have to accept the confetti to keep them.

import { useState } from "react";
import type { JSX, MouseEvent } from "react";

import { useEffects } from "../effects/context";
import {
  loadMotion,
  loadTheme,
  prefersReducedMotion,
  saveMotion,
  saveTheme,
  THEMES,
} from "../theme";
import type { Motion, Theme } from "../theme";
import { Button, Card, Field, SegmentedControl, Toggle } from "./ui";

/** Enough coins for the flight to be worth watching, few enough to read. */
const SAMPLE_COINS = 5;

export function AppearanceSettings(): JSX.Element {
  const { celebrate } = useEffects();

  // The document already carries the saved values — bootTheme applied them
  // before React mounted. Local state exists only so a tap repaints the
  // control at once; reading storage in an initialiser keeps it out of an
  // effect, which would flash the wrong selection for a frame.
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [motion, setMotion] = useState<Motion>(() => loadMotion());

  const reduced = prefersReducedMotion();
  const hint = THEMES.find((option) => option.id === theme)?.hint ?? "";

  const chooseTheme = (next: Theme): void => {
    saveTheme(next);
    setTheme(next);
  };

  const chooseMotion = (calm: boolean): void => {
    const next: Motion = calm ? "calm" : "full";
    saveMotion(next);
    setMotion(next);
  };

  const preview = (event: MouseEvent<HTMLButtonElement>): void => {
    // Fly from the button itself, so the sample looks like the real thing.
    const origin = event.currentTarget.getBoundingClientRect();
    celebrate("coinfly", { coin: SAMPLE_COINS, origin });
    celebrate("burst", { origin });
  };

  return (
    <Card>
      <h2 className="mb-3 text-base font-bold text-ink">みため と えんしゅつ</h2>

      <div className="space-y-4">
        <Field label="いろ" hint={hint} group>
          <SegmentedControl
            value={theme}
            options={THEMES.map((option) => ({
              value: option.id,
              label: option.label,
            }))}
            onChange={chooseTheme}
            label="いろ"
            name="tsumiki-theme"
          />
        </Field>

        <div>
          <Toggle
            checked={motion === "calm"}
            onChange={chooseMotion}
            label="えんしゅつを ひかえめに する"
            hint="コインが とんだり ひかったり しなくなるよ"
          />
          {reduced ? (
            <p className="mt-1 text-sm text-muted">
              この たんまつの せっていで えんしゅつは すでに とまっているよ。
              ここを かえても みためは かわらないよ。
            </p>
          ) : null}
        </div>

        <Button variant="ghost" onClick={preview}>
          ためして みる
        </Button>
      </div>
    </Card>
  );
}
