import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";

const host = "127.0.0.1";
const port = Number(process.env.PWA_TEST_PORT || 4191);
const baseUrl = `http://${host}:${port}`;
const preview = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--host", host, "--port", String(port)],
  { stdio: ["ignore", "pipe", "pipe"] }
);

let previewOutput = "";
preview.stdout.on("data", (chunk) => {
  previewOutput += chunk;
});
preview.stderr.on("data", (chunk) => {
  previewOutput += chunk;
});

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    serviceWorkers: "allow",
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  const client = await context.newCDPSession(page);
  const appManifest = await client.send("Page.getAppManifest");
  assert.equal(appManifest.errors.length, 0, JSON.stringify(appManifest.errors));
  const manifest = JSON.parse(appManifest.data);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));

  const { installabilityErrors } = await client.send("Page.getInstallabilityErrors");
  assert.deepEqual(installabilityErrors, []);

  const cacheState = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const name of names) {
      const cache = await caches.open(name);
      urls.push(...(await cache.keys()).map((request) => new URL(request.url).pathname));
    }
    return { names, urls };
  });
  assert.ok(cacheState.names.some((name) => name.startsWith("hqbase-pwa-")));
  assert.ok(cacheState.urls.includes("/offline.html"));
  assert.equal(
    cacheState.urls.some((url) => url.startsWith("/api/")),
    false
  );

  await context.setOffline(true);
  const offlineResponse = await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(offlineResponse?.fromServiceWorker(), true);
  await page.getByRole("heading", { name: "You're offline" }).waitFor();
  assert.match(await page.locator("main").innerText(), /does not store mail or account data/i);

  console.log(
    JSON.stringify({
      manifest: manifest.name,
      installabilityErrors: installabilityErrors.length,
      cachedAssets: cacheState.urls.length,
      offlineFallback: true,
      viewport: "390x844"
    })
  );
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
}

async function waitForPreview() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (preview.exitCode !== null) {
      throw new Error(`PWA preview exited before startup.\n${previewOutput}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PWA preview did not start.\n${previewOutput}`);
}
