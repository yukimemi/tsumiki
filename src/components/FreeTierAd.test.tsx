// @vitest-environment jsdom
//
// The gating here is the whole point of the component: it must never render
// for a "pro" household, and it must never render before an ad network is
// actually configured. Either check silently regressing (e.g. a future
// SettingsScreen refactor dropping the plan prop) should fail loudly here,
// not surface as an ad quietly appearing where AGENTS.md's invariant table
// says it must not.

import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FreeTierAd } from "./FreeTierAd";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("FreeTierAd", () => {
  it("renders nothing for a pro household", () => {
    render(<FreeTierAd plan="pro" />);
    expect(document.querySelector(".adsbygoogle")).toBeNull();
    expect(document.body.textContent).toBe("");
  });

  it("renders nothing for a free household when no ad network is configured", () => {
    // VITE_ADSENSE_CLIENT / VITE_ADSENSE_SLOT are unset in this test run,
    // which is also their real default until issue #36's follow-up wires a
    // publisher id in.
    render(<FreeTierAd plan="free" />);
    expect(document.querySelector(".adsbygoogle")).toBeNull();
    expect(document.body.textContent).toBe("");
  });
});
