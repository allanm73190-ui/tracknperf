/// <reference lib="webworker" />

// Minimal Service Worker for V1.
// We keep this intentionally small; offline/sync logic lives in the app.

declare const self: ServiceWorkerGlobalScope & {
  // populated by workbox injectManifest at build time
  __WB_MANIFEST: Array<{ url: string; revision?: string }>;
};

// Ensure workbox can inject precache manifest.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __precacheManifest = self.__WB_MANIFEST;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Default network behavior (no caching yet).
});

