import { expect, test } from "@playwright/test";
import { ensureStagingSetup } from "./setup";

test("owner can leave Nightly without changing the installed release", async ({ page }) => {
  const request = page.context().request;
  await ensureStagingSetup(request);
  const login = await request.post("/api/auth/sign-in/email", {
    data: {
      email: process.env.HQBASE_STAGING_OWNER_EMAIL,
      password: process.env.HQBASE_STAGING_OWNER_PASSWORD,
      rememberMe: false
    }
  });
  expect(login.ok()).toBeTruthy();
  const before = await (await request.get("/api/health")).json();
  try {
    await page.goto("/settings/updates");
    const nightly = page.getByRole("checkbox", { name: "Receive Nightly updates" });
    await expect(nightly).toBeEnabled({ timeout: 30_000 });
    await expect(nightly).not.toBeChecked();
    await nightly.click();
    await expect(nightly).toBeChecked({ timeout: 30_000 });
    await expect(nightly).toBeEnabled({ timeout: 30_000 });
    await page.reload();
    await expect(nightly).toBeChecked({ timeout: 30_000 });
    await expect(nightly).toBeEnabled();
    await nightly.click();
    await expect(nightly).not.toBeChecked({ timeout: 30_000 });
    await expect(nightly).toBeEnabled({ timeout: 30_000 });
    const status = await request.get("/api/updates/channel");
    expect(status.ok()).toBeTruthy();
    expect(await status.json()).toMatchObject({
      channel: "stable"
    });
    expect(await (await request.get("/api/health")).json()).toMatchObject({
      version: before.version
    });
  } finally {
    expect(
      (await request.post("/api/updates/channel", { data: { channel: "stable" } })).ok()
    ).toBeTruthy();
  }
});
