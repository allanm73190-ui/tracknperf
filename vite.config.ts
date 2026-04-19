import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  // Ensure dev/preview serve index.html for deep links like /admin
  appType: "spa",
  resolve: {
    // Prevent "Invalid hook call" caused by multiple React copies in parent folders.
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
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
