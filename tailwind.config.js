/*
 * Tailwind is the geometry layer only. Every colour it hands out is a
 * slot from src/index.css, spelled with <alpha-value> so `bg-panel/60`
 * still works — which is why there is not a single `dark:` prefix
 * anywhere in this app: the palette changes underneath the same class.
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "rgb(from var(--paper) r g b / <alpha-value>)",
        panel: "rgb(from var(--panel) r g b / <alpha-value>)",
        sunk: "rgb(from var(--sunk) r g b / <alpha-value>)",
        ink: "rgb(from var(--ink) r g b / <alpha-value>)",
        muted: "rgb(from var(--muted) r g b / <alpha-value>)",
        rule: "rgb(from var(--rule) r g b / <alpha-value>)",
        "rule-strong": "rgb(from var(--rule-strong) r g b / <alpha-value>)",

        coin: "rgb(from var(--coin) r g b / <alpha-value>)",
        done: "rgb(from var(--done) r g b / <alpha-value>)",
        wait: "rgb(from var(--wait) r g b / <alpha-value>)",
        late: "rgb(from var(--late) r g b / <alpha-value>)",
        self: "rgb(from var(--self) r g b / <alpha-value>)",
        "on-coin": "rgb(from var(--on-coin) r g b / <alpha-value>)",

        "m-sakura": "rgb(from var(--m-sakura) r g b / <alpha-value>)",
        "m-sora": "rgb(from var(--m-sora) r g b / <alpha-value>)",
        "m-wakaba": "rgb(from var(--m-wakaba) r g b / <alpha-value>)",
        "m-yamabuki": "rgb(from var(--m-yamabuki) r g b / <alpha-value>)",
        "m-fuji": "rgb(from var(--m-fuji) r g b / <alpha-value>)",
        "m-kohaku": "rgb(from var(--m-kohaku) r g b / <alpha-value>)",
      },
      fontFamily: {
        // Rounded first: this is a screen a six-year-old reads. The
        // system faces are the fallback, not the intent.
        sans: [
          '"Hiragino Maru Gothic ProN"',
          '"Zen Maru Gothic"',
          '"Noto Sans JP"',
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          '"Yu Gothic UI"',
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "var(--radius)",
        sheet: "calc(var(--radius) + 8px)",
        pill: "999px",
      },
      spacing: {
        tap: "var(--tap)",
        nav: "var(--nav-h)",
      },
      minHeight: {
        tap: "var(--tap)",
      },
      minWidth: {
        tap: "var(--tap)",
      },
      boxShadow: {
        // Every one of these is written against --glow, so daylight
        // (--glow: 0) collapses the halo term to zero blur and matsuri
        // (1.4) blows it out, from the same class name.
        card: "0 1px 2px rgb(from var(--ink) r g b / 0.05), 0 0 calc(14px * var(--glow)) rgb(from var(--ink) r g b / 0.35)",
        lift: "0 6px 18px rgb(from var(--sunk) r g b / 0.16), 0 0 calc(20px * var(--glow)) rgb(from var(--ink) r g b / 0.4)",
        "glow-self":
          "0 0 calc(16px * var(--glow)) rgb(from var(--self) r g b / 0.65)",
        "glow-coin":
          "0 0 calc(16px * var(--glow)) rgb(from var(--coin) r g b / 0.7)",
        "glow-done":
          "0 0 calc(16px * var(--glow)) rgb(from var(--done) r g b / 0.65)",
        "glow-wait":
          "0 0 calc(14px * var(--glow)) rgb(from var(--wait) r g b / 0.6)",
        "glow-late":
          "0 0 calc(14px * var(--glow)) rgb(from var(--late) r g b / 0.6)",
        nav: "0 -2px 12px rgb(from var(--sunk) r g b / 0.14), 0 0 calc(18px * var(--glow)) rgb(from var(--self) r g b / 0.16)",
      },
      keyframes: {
        // Ordinary UI motion, not a celebration: these are not gated on
        // --fx, only on prefers-reduced-motion.
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        "sheet-slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "none" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 200ms cubic-bezier(0.2, 0.8, 0.3, 1) both",
        "sheet-slide-up":
          "sheet-slide-up 240ms cubic-bezier(0.2, 0.9, 0.25, 1) both",
      },
    },
  },
  plugins: [],
};
