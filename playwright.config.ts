import { defineConfig } from "@playwright/test";

const baseURL = process.env.HQBASE_PRO_STAGING_URL;
if (!baseURL && process.env.CI) {
  throw new Error("HQBASE_PRO_STAGING_URL is required. Pro E2E runs only in staging.");
}

export default defineConfig({
  testDir: "./test/e2e/staging",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: baseURL ?? "https://staging.invalid",
    trace: "retain-on-failure"
  }
});
