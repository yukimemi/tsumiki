// Renders docs/terms.md and blocks until the signed-in user accepts it.
// Mounted by src/auth/TermsGate.tsx, so this component never decides on its
// own whether it should be showing — the gate already checked
// UserDoc.termsVersion against CURRENT_TERMS_VERSION.
//
// docs/terms.md is imported as raw text rather than rendered through a
// markdown library: the document only ever uses `##` headings, `-` bullets
// and blank-line paragraphs, so a general-purpose renderer would be one more
// dependency for a shape this small covers completely.

import { useState } from "react";
import type { JSX, ReactNode } from "react";

import termsMd from "../../docs/terms.md?raw";
import { Button, Card } from "../components/ui";
import { CURRENT_TERMS_VERSION } from "../lib/terms";
import { useAction } from "./useAction";

type Block =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

/**
 * Splits on blank lines, then classifies each chunk by its first line. A
 * bullet chunk may wrap a long item onto an indented continuation line (no
 * leading "- "), which folds into the item above it rather than starting a
 * fresh one.
 */
function parseTerms(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of markdown.trim().split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;
    if (lines[0].startsWith("## ")) {
      blocks.push({ type: "heading", text: lines[0].slice(3).trim() });
      continue;
    }
    if (lines[0].startsWith("# ")) continue; // Title/date line, shown separately.
    if (lines[0].startsWith("- ")) {
      const items: string[] = [];
      for (const line of lines) {
        if (line.startsWith("- ")) items.push(line.slice(2).trim());
        else items[items.length - 1] += line.trim();
      }
      blocks.push({ type: "list", items });
      continue;
    }
    blocks.push({ type: "paragraph", text: lines.join("") });
  }
  return blocks;
}

const blocks = parseTerms(termsMd);

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
        {blocks.map((block, i): ReactNode => {
          if (block.type === "heading") {
            return (
              <h2 key={i} className="text-sm font-bold text-ink">
                {block.text}
              </h2>
            );
          }
          if (block.type === "list") {
            return (
              <ul key={i} className="list-disc space-y-1 pl-5 text-sm text-muted">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          }
          return (
            <p key={i} className="text-sm text-muted">
              {block.text}
            </p>
          );
        })}
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
