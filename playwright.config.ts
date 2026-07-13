import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.HQBASE_STAGING_URL;
const accessClientId = process.env.HQBASE_STAGING_ACCESS_CLIENT_ID;
const accessClientSecret = process.env.HQBASE_STAGING_ACCESS_CLIENT_SECRET;
if (!baseURL && process.env.CI) {
  throw new Error("HQBASE_STAGING_URL is required. E2E tests run only against dedicated staging.");
}
if (baseURL && process.env.CI && (!accessClientId || !accessClientSecret)) {
  throw new Error("Cloudflare Access service-token credentials are required for staging E2E.");
}

export default defineConfig({
  testDir: "./test/e2e/staging",
  timeout: 90_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: baseURL ?? "https://staging.invalid",
    extraHTTPHeaders:
      accessClientId && accessClientSecret
        ? {
            "CF-Access-Client-Id": accessClientId,
            "CF-Access-Client-Secret": accessClientSecret
          }
        : undefined,
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
    ...devices["Desktop Chrome"]
  }
});
