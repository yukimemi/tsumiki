// Renders docs/terms.md and blocks until the signed-in user accepts it.
// Mounted by src/auth/TermsGate.tsx, so this component never decides on its
// own whether it should be showing — the gate already checked
// UserDoc.termsVersion against CURRENT_TERMS_VERSION.
//
// docs/terms.md is imported as raw text and parsed by
// src/lib/markdownBlocks.ts rather than rendered through a markdown
// library: the document only ever uses `##` headings, `-` bullets and
// blank-line paragraphs, so a general-purpose renderer would be one more
// dependency for a shape this small covers completely.

import { useState } from "react";
import type { JSX } from "react";

import termsMd from "../../docs/terms.md?raw";
import { MarkdownBlocks } from "../components/MarkdownBlocks";
import { Button, Card } from "../components/ui";
import { parseMarkdownBlocks } from "../lib/markdownBlocks";
import { CURRENT_TERMS_VERSION } from "../lib/terms";
import { useAction } from "./useAction";

const blocks = parseMarkdownBlocks(termsMd);

export function TermsScreen({
  onAccept,
}: {
  onAccept(): Promise<void>;
}): JSX.Element {
  const action = useAction();
  const [read, setRead] = useState(false);

  const accept = () => {
    void action.run(onAccept);
  };

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col gap-4 px-3 py-4">
      <h1 className="text-lg font-bold text-ink">りようきやくへの どうい</h1>
      <p className="text-sm text-muted">
        つづける まえに、りようきやくを よんで どういしてください。
      </p>

      <Card
        className="max-h-[55vh] overflow-y-auto space-y-3"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) setRead(true);
        }}
      >
        <MarkdownBlocks blocks={blocks} />
      </Card>

      {action.error ? (
        <p className="text-sm font-bold text-late">{action.error}</p>
      ) : null}

      <Button block disabled={!read || action.busy} onClick={accept}>
        {read ? "どういして つづける" : "さいごまで よんでね"}
      </Button>
      <p className="text-center text-xs text-muted">
        バージョン {CURRENT_TERMS_VERSION}
      </p>
    </div>
  );
}
