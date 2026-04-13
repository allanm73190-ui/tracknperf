import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Workaround: SW generation is unstable on Node 24+ (workbox/terser early-exit).
      // Keep PWA manifest plumbing; allow re-enabling by using Node LTS or setting
      // `PWA_DISABLE=false` explicitly.
      disable:
        process.env.PWA_DISABLE === "true" ||
        Number(process.versions.node.split(".")[0]) >= 24,
      manifest: {
        name: "TrackNPerf",
        short_name: "TrackNPerf",
        start_url: "/",
        display: "standalone",
        background_color: "#0b1220",
        theme_color: "#0b1220",
      },
    }),
  ],
});

