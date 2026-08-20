import {
  type APIRequestContext,
  expect,
  request as playwrightRequest,
  test
} from "@playwright/test";

test.use({ screenshot: "off", trace: "off", video: "off" });

test("personal access token creation, isolation, and revocation", async ({ page }) => {
  const stagingUrl = required("HQBASE_STAGING_URL");
  const ownerEmail = required("HQBASE_STAGING_OWNER_EMAIL");
  const ownerPassword = required("HQBASE_STAGING_OWNER_PASSWORD");
  const accessClientId = required("HQBASE_STAGING_ACCESS_CLIENT_ID");
  const accessClientSecret = required("HQBASE_STAGING_ACCESS_CLIENT_SECRET");
  const uniqueName = `PAT staging ${Date.now()} ${process.env.GITHUB_RUN_ID ?? "local"}`;
  let plaintext: string | null = null;
  let recordId: string | null = null;
  let patRequest: APIRequestContext | null = null;

  try {
    await page.goto("/settings/api", { waitUntil: "domcontentloaded" });
    const createToken = page.getByRole("button", { name: "Create token" });
    const loginEmail = page.getByLabel("Email");
    await expect(loginEmail.or(createToken)).toBeVisible({ timeout: 60_000 });
    if (await loginEmail.isVisible()) {
      await loginEmail.fill(ownerEmail);
      await page.getByLabel("Password").fill(ownerPassword);
      await page.getByRole("button", { name: "Continue" }).click();
    }
    await expect(createToken).toBeVisible({ timeout: 60_000 });

    await createToken.click();
    const tokenName = page.getByRole("textbox", { name: "Name" });
    const reauthenticationPassword = page.getByLabel("Password");
    await expect(tokenName.or(reauthenticationPassword)).toBeVisible();
    if (await reauthenticationPassword.isVisible()) {
      await reauthenticationPassword.fill(ownerPassword);
      await page.getByRole("button", { name: "Sign in and continue" }).click();
    }
    await tokenName.fill(uniqueName);
    await page.getByRole("button", { name: "Create personal access token" }).click();

    const oneTimeDialog = page.getByRole("dialog", {
      name: "Personal access token created"
    });
    await expect(oneTimeDialog).toBeVisible();
    plaintext = await oneTimeDialog.locator("code").textContent();
    if (!plaintext) throw new Error("The one-time token value was unavailable.");
    expect(plaintext.length > 0).toBe(true);

    const metadataResponse = await page.request.get("/api/personal-access-tokens");
    expect(metadataResponse.status()).toBe(200);
    const metadata = (await metadataResponse.json()) as {
      personalAccessTokens: Array<{ id: string; name: string }>;
    };
    const matchingTokens = metadata.personalAccessTokens.filter(
      (token) => token.name === uniqueName
    );
    expect(matchingTokens.map((token) => token.name)).toEqual([uniqueName]);
    recordId = matchingTokens[0]?.id ?? null;
    if (!recordId) throw new Error("The named token metadata was unavailable.");
    await expect(page.getByRole("button", { name: `Revoke ${uniqueName}` })).toBeAttached();

    await page.evaluate(() => {
      Object.assign(window, { __hqbasePatPageShowPersisted: false });
      window.addEventListener("pageshow", (event) => {
        if (event.persisted) Object.assign(window, { __hqbasePatPageShowPersisted: true });
      });
    });
    await page.goto("/settings/interface", { waitUntil: "domcontentloaded" });
    await page.goBack({ waitUntil: "domcontentloaded" });
    const pageShowPersisted = await page.evaluate(
      () =>
        (window as typeof window & { __hqbasePatPageShowPersisted?: boolean })
          .__hqbasePatPageShowPersisted === true
    );
    expect(pageShowPersisted).toBe(true);
    const plaintextCleared = await page.evaluate(() => {
      const oneTimeModalOpen = [...document.querySelectorAll('[role="dialog"]')].some((dialog) =>
        dialog.textContent?.includes("Copy this token now. HQBase cannot show it again.")
      );
      return !oneTimeModalOpen && document.querySelector("code") === null;
    });
    expect(plaintextCleared).toBe(true);

    patRequest = await playwrightRequest.newContext({
      baseURL: stagingUrl,
      extraHTTPHeaders: {
        "CF-Access-Client-Id": accessClientId,
        "CF-Access-Client-Secret": accessClientSecret,
        authorization: `Bearer ${plaintext}`
      }
    });
    const initialPatStorage = await patRequest.storageState();
    expect(initialPatStorage.cookies.length).toBe(0);

    const mailboxes = await patRequest.get("/api/v1/mailboxes");
    expect(mailboxes.status()).toBe(200);
    const mailboxMetadata = await mailboxes.json();
    expect(Array.isArray(mailboxMetadata)).toBe(true);

    const privateUsers = await patRequest.get("/api/users");
    expect(privateUsers.status()).toBe(401);
    const privateError = (await privateUsers.json()) as { error?: { code?: string } };
    expect(privateError.error?.code === "UNAUTHENTICATED").toBe(true);

    await page.getByRole("button", { name: `Revoke ${uniqueName}` }).click();
    await expect(page.getByRole("dialog", { name: `Revoke ${uniqueName}?` })).toBeVisible();
    await page.getByRole("button", { name: "Revoke token" }).click();
    await expect(page.getByRole("button", { name: `Revoke ${uniqueName}` })).toHaveCount(0);

    const revokedMailboxes = await patRequest.get("/api/v1/mailboxes");
    expect(revokedMailboxes.status()).toBe(401);
    const revokedError = (await revokedMailboxes.json()) as { error?: { code?: string } };
    expect(revokedError.error?.code === "INVALID_PERSONAL_ACCESS_TOKEN").toBe(true);
  } finally {
    await patRequest?.dispose();
    try {
      const cleanupList = await page.request.get("/api/personal-access-tokens");
      if (cleanupList.status() === 200) {
        const cleanupMetadata = (await cleanupList.json()) as {
          personalAccessTokens: Array<{ id: string; name: string }>;
        };
        const cleanupRecordId = recordId
          ? cleanupMetadata.personalAccessTokens.some((token) => token.id === recordId)
            ? recordId
            : null
          : (cleanupMetadata.personalAccessTokens.find((token) => token.name === uniqueName)?.id ??
            null);
        if (cleanupRecordId) {
          const cleanupRevoke = await page.request.delete(
            `/api/personal-access-tokens/${encodeURIComponent(cleanupRecordId)}`
          );
          expect(cleanupRevoke.status()).toBe(204);
        }
      }
    } finally {
      plaintext = null;
    }
  }
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for HQBase staging E2E.`);
  return value;
}
