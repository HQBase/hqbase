import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  isAllowedPrecacheUrl,
  renderServiceWorker,
  validateManifest
} from "../../../scripts/build-pwa.mjs";

function pngInfo(bytes) {
  return {
    colorType: bytes.readUInt8(25),
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16)
  };
}

describe("PWA build contract", () => {
  it("ships an installable, standalone manifest", async () => {
    const manifest = JSON.parse(await readFile("public/manifest.webmanifest", "utf8"));
    expect(() => validateManifest(manifest)).not.toThrow();
    expect(manifest.name).toBe("HQBase");
    expect(manifest.theme_color).toBe("#080808");
  });

  it("keeps lifecycle metadata revalidated and hashed assets immutable", async () => {
    const [html, headers, iconGenerator, logo, favicon] = await Promise.all([
      readFile("index.html", "utf8"),
      readFile("public/_headers", "utf8"),
      readFile("scripts/generate-pwa-icons.mjs", "utf8"),
      readFile("public/logo.svg", "utf8"),
      readFile("public/favicon.svg", "utf8")
    ]);
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="icon" href="/favicon.svg" type="image/svg+xml"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain("viewport-fit=cover");
    expect(iconGenerator).toContain('readFile(path.join(root, "public/logo.svg"), "utf8")');
    expect(iconGenerator).toContain('file: "apple-touch-icon.png", markWidth: 108');
    expect(iconGenerator).toContain('file: "icon-512.png", markWidth: 308');
    expect(iconGenerator).toContain('file: "icon-maskable-512.png", markWidth: 266');
    expect(iconGenerator).toContain('file: "notification-badge.png"');
    expect(logo).toContain('width="168" height="132" viewBox="42 55 168 132"');
    expect(logo).toContain("<title>HQBase</title>");
    expect(logo).not.toContain('fill="black"');
    expect(logo).toContain('id="paint0_linear_68_26"');
    expect(favicon).toContain('width="191" height="191" viewBox="30.5 25.5 191 191"');
    expect(favicon).not.toContain('fill="black"');
    expect(headers).toMatch(/\/service-worker\.js[\s\S]*no-cache, no-store, must-revalidate/);
    expect(headers).toMatch(/\/assets\/\*[\s\S]*max-age=31536000, immutable/);
  });

  it("ships purpose-built icon canvases", async () => {
    const [apple, icon192, icon512, maskable, badge] = await Promise.all(
      [
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-512.png",
        "notification-badge.png"
      ].map((file) => readFile(`public/icons/${file}`))
    );

    expect(pngInfo(apple)).toEqual({ colorType: 2, height: 180, width: 180 });
    expect(pngInfo(icon192)).toEqual({ colorType: 2, height: 192, width: 192 });
    expect(pngInfo(icon512)).toEqual({ colorType: 2, height: 512, width: 512 });
    expect(pngInfo(maskable)).toEqual({ colorType: 2, height: 512, width: 512 });
    expect(pngInfo(badge)).toEqual({ colorType: 6, height: 96, width: 96 });
  });

  it("allows only public shell assets into the precache", () => {
    expect(isAllowedPrecacheUrl("/assets/app-abc.js")).toBe(true);
    expect(isAllowedPrecacheUrl("/favicon.svg")).toBe(true);
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
    expect(worker).toContain('badge: "/icons/notification-badge.png"');
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
