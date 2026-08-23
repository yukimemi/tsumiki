import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "tsumiki - かぞくの積み木",
        short_name: "tsumiki",
        description:
          "やることを積み上げて、コインを貯めて、かぞくで見せ合うタスクアプリ",
        lang: "ja",
        theme_color: "#f7b32b",
        background_color: "#fffaf0",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        // Firebase Auth handler and any future API routes must hit the network.
        navigateFallbackDenylist: [/^\/__\/auth/, /^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Firebase Auth signInWithPopup needs the opener relationship preserved.
    headers: { "Cross-Origin-Opener-Policy": "same-origin-allow-popups" },
    // Listen on 0.0.0.0 so Tailscale / LAN can reach the dev server.
    host: true,
    // Allow access via Tailscale (.ts.net) and any LAN host.
    // Leading dot matches the domain and all subdomains.
    allowedHosts: [".ts.net", ".local", "localhost"],
  },
});
