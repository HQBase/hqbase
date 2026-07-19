import { expect, test } from "@playwright/test";

test("deployed Community PWA shell is ready", async ({ page, request }) => {
  await expect
    .poll(
      async () => {
        try {
          return (await request.get("/api/health")).status();
        } catch {
          return 0;
        }
      },
      { timeout: 60_000 }
    )
    .toBe(200);

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  await expect(manifestResponse.json()).resolves.toMatchObject({
    display: "standalone",
    name: "HQBase Community",
    start_url: "/"
  });

  const serviceWorkerResponse = await request.get("/service-worker.js");
  expect(serviceWorkerResponse.ok()).toBeTruthy();
  expect(await serviceWorkerResponse.text()).toContain('"/offline.html"');
  expect((await request.get("/offline.html")).ok()).toBeTruthy();

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/HQBase/);
  await expect(page.locator("#root > *")).toBeVisible({ timeout: 30_000 });
});
