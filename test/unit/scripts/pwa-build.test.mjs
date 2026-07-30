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
    expect(manifest.name).toBe("HQBase");
    expect(manifest.theme_color).toBe("#080808");
  });

  it("keeps lifecycle metadata revalidated and hashed assets immutable", async () => {
    const [html, headers, iconGenerator, logo] = await Promise.all([
      readFile("index.html", "utf8"),
      readFile("public/_headers", "utf8"),
      readFile("scripts/generate-pwa-icons.mjs", "utf8"),
      readFile("public/logo.svg", "utf8")
    ]);
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="icon" href="/logo.svg" type="image/svg+xml"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain("viewport-fit=cover");
    expect(iconGenerator).toContain('readFile(path.join(root, "public/logo.svg"), "utf8")');
    expect(logo).toContain('width="251" height="251" viewBox="0 0 251 251"');
    expect(logo).toContain("<title>HQBase</title>");
    expect(logo).toContain('<rect width="251" height="251" fill="black"/>');
    expect(logo).toContain('id="paint0_linear_68_26"');
    expect(headers).toMatch(/\/service-worker\.js[\s\S]*no-cache, no-store, must-revalidate/);
    expect(headers).toMatch(/\/assets\/\*[\s\S]*max-age=31536000, immutable/);
  });

  it("allows only public shell assets into the precache", () => {
    expect(isAllowedPrecacheUrl("/assets/app-abc.js")).toBe(true);
    expect(isAllowedPrecacheUrl("/offline.html")).toBe(true);
    expect(isAllowedPrecacheUrl("/sounds/incoming-email.wav")).toBe(true);
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

  it("generates visible push notifications, unread badging, and safe message navigation", () => {
    const worker = renderServiceWorker({
      cacheName: "hqbase-pwa-test-1",
      precacheUrls: ["/assets/app-abc.js", "/offline.html"]
    });
    expect(worker).toContain('addEventListener("push"');
    expect(worker).toContain('showNotification("New email"');
    expect(worker).toContain("setAppBadge(unreadCount)");
    expect(worker).toContain('"hqbase:push-received"');
    expect(worker).toContain('addEventListener("notificationclick"');
    expect(worker).toContain('return "/inbox"');
  });
});
