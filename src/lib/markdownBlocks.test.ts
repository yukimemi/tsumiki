// The parser has no separator when it joins a wrapped line back onto the
// block above it — that is what turned into a real, shipped typo in
// docs/privacy.md (a Latin word glued straight onto the following Japanese
// text). These tests lock down exactly the shapes both docs/terms.md and
// docs/privacy.md rely on, so a future edit that reintroduces a bad wrap
// point — or a change to the parser itself — fails here instead of only
// showing up as a rendered typo.

import { describe, expect, it } from "vitest";

import { parseMarkdownBlocks } from "./markdownBlocks";

describe("parseMarkdownBlocks", () => {
  it("drops the title line and reads a heading", () => {
    const blocks = parseMarkdownBlocks("# タイトル\n\n## 1. みだし\n\n本文です。");
    expect(blocks).toEqual([
      { type: "heading", text: "1. みだし" },
      { type: "paragraph", text: "本文です。" },
    ]);
  });

  it("joins a wrapped paragraph with no separator", () => {
    const blocks = parseMarkdownBlocks("一行目のとちゅうで\n二行目につづく文章です。");
    expect(blocks).toEqual([
      { type: "paragraph", text: "一行目のとちゅうで二行目につづく文章です。" },
    ]);
  });

  it("folds a wrapped bullet continuation into the item above it", () => {
    const blocks = parseMarkdownBlocks("- ひとつめの こうもく\n  つづきの ぶんしょう\n- ふたつめの こうもく");
    expect(blocks).toEqual([
      {
        type: "list",
        items: ["ひとつめの こうもくつづきの ぶんしょう", "ふたつめの こうもく"],
      },
    ]);
  });

  it("keeps separate blocks separate across a blank line", () => {
    const blocks = parseMarkdownBlocks("## みだし\n\n- こうもく1\n- こうもく2\n\nだんらく。");
    expect(blocks).toEqual([
      { type: "heading", text: "みだし" },
      { type: "list", items: ["こうもく1", "こうもく2"] },
      { type: "paragraph", text: "だんらく。" },
    ]);
  });

  it("has no separator at a wrap point, so a Latin word touching the break glues onto the next line", () => {
    // This is the exact bug class docs/privacy.md shipped once: wrapping a
    // source line right after "Google" produced "Googleサインインです。" with
    // no space. The parser's behavior here is intentional (matches
    // docs/terms.md's existing wraps, which never cross a Latin/Japanese
    // boundary) — this test exists so any future markdown edit that
    // reintroduces the pattern is caught by review of *this* assertion,
    // not by a visual typo in production.
    const blocks = parseMarkdownBlocks("これは Google\nサインインです。");
    expect(blocks).toEqual([
      { type: "paragraph", text: "これは Googleサインインです。" },
    ]);
  });
});
