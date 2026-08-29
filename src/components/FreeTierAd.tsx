import { useEffect } from "react";

import { Card } from "./ui";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT;
const AD_SLOT = import.meta.env.VITE_ADSENSE_SLOT;

let scriptLoad: Promise<void> | null = null;

/** Loads the AdSense loader script at most once per page load. */
function loadAdsenseScript(client: string): Promise<void> {
  if (!scriptLoad) {
    scriptLoad = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.src =
        "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
        encodeURIComponent(client);
      script.crossOrigin = "anonymous";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("adsbygoogle failed to load"));
      document.head.appendChild(script);
    });
  }
  return scriptLoad;
}

/**
 * The only place an ad is allowed to render, and only for a free-plan
 * parent. Callers must already be inside an `isParent` branch — this
 * component does not re-check role, only plan, so it must never be mounted
 * anywhere a child's session can reach.
 *
 * Renders nothing until `VITE_ADSENSE_CLIENT` / `VITE_ADSENSE_SLOT` are
 * configured, which they are not yet — see issue #36. Wiring the real
 * publisher id in later is then a config change, not a code change.
 */
export function FreeTierAd(props: { plan: "free" | "pro" }) {
  useEffect(() => {
    if (!AD_CLIENT || !AD_SLOT || props.plan === "pro") return;
    let cancelled = false;
    loadAdsenseScript(AD_CLIENT)
      .then(() => {
        if (cancelled) return;
        window.adsbygoogle = window.adsbygoogle ?? [];
        window.adsbygoogle.push({});
      })
      .catch(() => {
        // Network/ad-blocker failure. No fallback UI — a missing ad is
        // silent by design, unlike a missing feature.
      });
    return () => {
      cancelled = true;
    };
  }, [props.plan]);

  if (!AD_CLIENT || !AD_SLOT || props.plan === "pro") return null;

  return (
    <Card>
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={AD_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </Card>
  );
}
