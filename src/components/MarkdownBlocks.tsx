// Renders the block shape src/lib/markdownBlocks.ts parses out of
// docs/terms.md / docs/privacy.md. Shared by TermsScreen (which gates on
// reading it) and PrivacyScreen (which just displays it) so the heading/
// list/paragraph markup exists in exactly one place.

import type { MarkdownBlock } from "../lib/markdownBlocks";

export function MarkdownBlocks({ blocks }: { blocks: MarkdownBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
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
    </>
  );
}
