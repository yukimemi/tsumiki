// A phone-only nudge to install tsumiki as a PWA. Renders nothing on
// desktop and nothing once the app is already running standalone -- the
// whole point is to catch the one moment (installed on a phone, opened in
// the browser) where the user probably meant to tap the home-screen icon
// instead.

import { useState, useSyncExternalStore } from "react";
import type { JSX } from "react";

import {
  clearInstallPrompt,
  getInstallPrompt,
  isIosDevice,
  isMobileDevice,
  isRunningStandalone,
  subscribeInstallPrompt,
} from "../lib/pwaInstall";
import { Button, Card } from "./ui";

export function InstallPwaCard(): JSX.Element | null {
  // The prompt is captured at module scope (see pwaInstall.ts) so it isn't
  // lost to the one-shot `beforeinstallprompt` firing before this card ever
  // mounts; `useSyncExternalStore` just mirrors that module state into React.
  const deferredPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPrompt,
  );
  const [dismissed, setDismissed] = useState(false);

  if (!isMobileDevice() || isRunningStandalone() || dismissed) return null;

  const ios = isIosDevice();
  // Android/Chrome without a captured prompt (e.g. already installed in a
  // way this session hasn't detected, or a non-Chromium browser) has
  // nothing to offer a tap on, so stay quiet rather than show a dead button.
  if (!ios && !deferredPrompt) return null;

  const install = async (): Promise<void> => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // Chrome only honors `.prompt()` once per captured event either way.
    clearInstallPrompt();
  };

  return (
    <Card>
      <h2 className="mb-2 text-base font-bold text-ink">
        アプリとして つかう
      </h2>
      {ios ? (
        <p className="text-sm text-muted">
          がめんの したにある「共有」ボタン（□に↑の マーク）から
          「ホーム画面に追加」を えらぶと、アプリみたいに つかえるよ。
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            ホーム画面に ついかすると、アプリみたいに すぐ ひらけるよ。
          </p>
          <div className="flex gap-2">
            <Button variant="primary" block onClick={() => void install()}>
              ホーム画面に ついか
            </Button>
            <Button variant="ghost" onClick={() => setDismissed(true)}>
              あとで
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
