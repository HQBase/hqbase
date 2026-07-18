import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  isAllowedPrecacheUrl,
  renderServiceWorker,
  validateManifest
} from "../../../scripts/build-pwa.mjs";

describe("PWA build contract", () => {
  it("ships an installable, standalone manifest", async () => {
    const manifest = JSON.parse(await readFile("public/manifest.webmanifest", "utf8"));
    expect(() => validateManifest(manifest)).not.toThrow();
    expect(manifest.name).toBe("HQBase Community");
    expect(manifest.theme_color).toBe("#09090b");
  });

  it("keeps lifecycle metadata revalidated and hashed assets immutable", async () => {
    const [html, headers] = await Promise.all([
      readFile("index.html", "utf8"),
      readFile("public/_headers", "utf8")
    ]);
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(headers).toMatch(/\/service-worker\.js[\s\S]*no-cache, no-store, must-revalidate/);
    expect(headers).toMatch(/\/assets\/\*[\s\S]*max-age=31536000, immutable/);
  });

  it("allows only public shell assets into the precache", () => {
    expect(isAllowedPrecacheUrl("/assets/app-abc.js")).toBe(true);
    expect(isAllowedPrecacheUrl("/offline.html")).toBe(true);
    expect(isAllowedPrecacheUrl("/api/me")).toBe(false);
    expect(isAllowedPrecacheUrl("/api/messages/123/attachment")).toBe(false);
    expect(isAllowedPrecacheUrl("/setup")).toBe(false);
  });

  it("generates network-first navigation and an explicit update handshake", () => {
    const worker = renderServiceWorker({
      cacheName: "hqbase-pwa-test-1",
      precacheUrls: ["/assets/app-abc.js", "/offline.html"]
    });
    expect(worker).toContain('request.mode === "navigate"');
    expect(worker).toContain('caches.match("/offline.html")');
    expect(worker).toContain('event.data?.type === "SKIP_WAITING"');
    expect(worker).not.toContain("/api/");
  });
});
