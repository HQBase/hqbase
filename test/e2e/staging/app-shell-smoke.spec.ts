import { expect, test } from "@playwright/test";

const stagingUrl = process.env.HQBASE_STAGING_URL ?? "";
const oauthClientId = process.env.HQBASE_STAGING_OAUTH_CLIENT_ID ?? "";

test("deployed HQBase PWA shell is ready", async ({ page, request }) => {
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

  await expect(async () => {
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBeTruthy();
    expect(await manifestResponse.json()).toMatchObject({
      display: "standalone",
      name: "HQBase",
      start_url: "/"
    });

    const serviceWorkerResponse = await request.get("/service-worker.js");
    expect(serviceWorkerResponse.ok()).toBeTruthy();
    expect(await serviceWorkerResponse.text()).toContain('"/offline.html"');
    expect((await request.get("/offline.html")).ok()).toBeTruthy();

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/HQBase/);
    await expect(page.locator("#root > *")).toBeVisible({ timeout: 10_000 });
  }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
});

test("customer-managed OAuth starts directly with the exact staging callback", async ({
  request
}) => {
  expect(oauthClientId).not.toBe("");
  const response = await request.get("/api/setup/cloudflare/oauth/start", {
    maxRedirects: 0
  });
  const target = new URL(response.headers().location ?? "");

  expect(response.status()).toBe(303);
  expect(target.origin).toBe("https://dash.cloudflare.com");
  expect(target.pathname).toBe("/oauth2/auth");
  expect(target.searchParams.get("client_id")).toBe(oauthClientId);
  expect(target.searchParams.get("redirect_uri")).toBe(
    `${new URL(stagingUrl).origin}/api/setup/cloudflare/oauth/callback`
  );
  expect(target.searchParams.get("scope")).toContain("email-routing-rule.write");
  expect(target.searchParams.get("code_challenge_method")).toBe("S256");
});
