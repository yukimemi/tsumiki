// Public, signed-out-reachable — same reasoning as AboutScreen.tsx: this is
// the actual privacy policy, so it has to be readable without an account,
// both for a visitor deciding whether to sign up and for anything (AdSense
// review included) that needs to crawl it.
//
// docs/privacy.md is parsed the same way docs/terms.md is (see
// src/lib/markdownBlocks.ts) — this screen only displays it, it does not
// gate on acceptance the way TermsScreen does.

import privacyMd from "../../docs/privacy.md?raw";
import { MarkdownBlocks } from "../components/MarkdownBlocks";
import { parseMarkdownBlocks } from "../lib/markdownBlocks";

const blocks = parseMarkdownBlocks(privacyMd);

export function PrivacyScreen() {
  return (
    <div
      className="h-full overflow-y-auto overscroll-contain"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <main className="safe-x safe-t safe-b mx-auto flex max-w-lg flex-col gap-3 px-4 py-10">
        <h1 className="text-lg font-bold text-ink">プライバシーポリシー</h1>
        <div className="flex flex-col gap-3">
          <MarkdownBlocks blocks={blocks} />
        </div>
      </main>
    </div>
  );
}
