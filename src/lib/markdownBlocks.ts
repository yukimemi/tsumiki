// A parser for exactly the markdown shape docs/terms.md and docs/privacy.md
// use — `##` headings, `-` bullets, blank-line paragraphs — shared by
// TermsScreen and PrivacyScreen rather than pulled from a markdown library,
// since neither document uses anything richer than this.

export type MarkdownBlock =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

/**
 * Splits on blank lines, then classifies each chunk by its first line. A
 * bullet chunk may wrap a long item onto an indented continuation line (no
 * leading "- "), which folds into the item above it rather than starting a
 * fresh one.
 */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
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
