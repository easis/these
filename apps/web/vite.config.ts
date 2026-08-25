import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      injectRegister: "auto",
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "these",
        short_name: "these",
        description: "A self-hosted gallery for browsing image and video folders, building shortlists, and downloading the keepers.",
        lang: "en",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f5f5f6",
        theme_color: "#f5f5f6",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{html,js,css}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:4000" },
  },
});
