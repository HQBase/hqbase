import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  type APIRequestContext,
  expect,
  request as playwrightRequest,
  test
} from "@playwright/test";

const email = required("HQBASE_STAGING_OWNER_EMAIL");
const password = required("HQBASE_STAGING_OWNER_PASSWORD");
const sender = required("HQBASE_STAGING_SENDER");
const domain = required("HQBASE_STAGING_EMAIL_DOMAIN");
const stagingUrl = required("HQBASE_STAGING_URL");

test("HQBase web lifecycle remains healthy", async ({ page, request }) => {
  const appOrigin = new URL(stagingUrl).origin;
  const appShellErrors: string[] = [];
  const recordAppShellError = (message: string): void => {
    if (appShellErrors.length < 20) appShellErrors.push(message);
  };
  page.on("pageerror", (error) => recordAppShellError(`pageerror: ${error.message}`));
  page.on("requestfailed", (failedRequest) => {
    const url = new URL(failedRequest.url());
    if (url.origin === appOrigin) {
      recordAppShellError(
        `requestfailed: ${url.pathname} (${failedRequest.failure()?.errorText ?? "unknown"})`
      );
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === appOrigin && response.status() >= 400) {
      recordAppShellError(`response: ${response.status()} ${url.pathname}`);
    }
  });

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

  const status = await request.get("/api/setup/status");
  expect(status.ok()).toBeTruthy();
  const setup = (await status.json()) as { isComplete: boolean };
  if (!setup.isComplete) {
    const grantCookie = stagingSetupGrantCookie(required("HQBASE_STAGING_AUTH_SECRET"));
    const bootstrap = await request.post("/api/setup/bootstrap", {
      data: {
        checklistAcknowledged: true,
        defaultFromMailboxAddress: sender,
        mailboxes: [{ address: sender, displayName: "HQBase E2E" }],
        ownerEmail: email,
        ownerName: "HQBase E2E Owner",
        ownerPassword: password,
        primaryDomain: domain
      },
      headers: { cookie: grantCookie }
    });
    expect(bootstrap.status()).toBe(201);
    await expect(bootstrap.json()).resolves.toMatchObject({ setup: { isComplete: true } });
  }

  await expect
    .poll(async () => {
      const response = await request.get("/api/setup/status");
      if (!response.ok()) return false;
      return ((await response.json()) as { isComplete: boolean }).isComplete;
    })
    .toBe(true);

  const login = await request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: false },
    headers: { origin: stagingUrl }
  });
  expect(
    login.ok(),
    `Owner API sign-in failed (${login.status()}): ${await login.text()}`
  ).toBeTruthy();
  const primaryEmailAction = page.getByRole("button", {
    name: /^(?:Compose|New email)$/
  });
  const loginEmail = page.getByLabel("Email");
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      loginEmail.or(primaryEmailAction),
      "HQBase app shell renders its authenticated state"
    ).toBeVisible({ timeout: 60_000 });
  } catch (error) {
    const shell = await page.evaluate(() => ({
      path: window.location.pathname,
      rootChildren: document.querySelector("#root")?.childElementCount ?? -1,
      scripts: [...document.scripts].map((script) =>
        script.src ? new URL(script.src).pathname : "(inline)"
      ),
      title: document.title
    }));
    console.error("HQBase app shell diagnostics", { appShellErrors, shell });
    throw error;
  }
  if (await loginEmail.isVisible()) {
    await loginEmail.fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(primaryEmailAction).toBeVisible({ timeout: 60_000 });
  const expectedUpdate = process.env.HQBASE_STAGING_EXPECT_UPDATE_VERSION;
  if (expectedUpdate) {
    await expect
      .poll(
        async () => {
          const response = await request.get("/api/updates");
          if (!response.ok()) return null;
          const update = (await response.json()) as {
            available?: boolean;
            release?: { version?: string };
          };
          return {
            available: update.available,
            version: update.release?.version
          };
        },
        { timeout: 60_000 }
      )
      .toEqual({ available: true, version: expectedUpdate });
    await expect(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.getByText("Update available", { exact: true })).toBeVisible({
        timeout: 15_000
      });
    }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    await expect(page.getByText(`HQBase ${expectedUpdate}`, { exact: false })).toBeVisible({
      timeout: 60_000
    });
  }
});

test("Track 1 enforces read-only mailbox access and exposes operator diagnostics", async ({
  request
}) => {
  const login = await request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: false },
    headers: { origin: stagingUrl }
  });
  expect(
    login.ok(),
    `Owner API sign-in failed (${login.status()}): ${await login.text()}`
  ).toBeTruthy();
  const mailboxesResponse = await request.get("/api/mailboxes");
  expect(mailboxesResponse.ok()).toBeTruthy();
  const mailboxes = (await mailboxesResponse.json()) as Array<{ id: string; address: string }>;
  const mailbox = mailboxes.find((item) => item.address === sender);
  expect(mailbox).toBeDefined();

  const suffix = `${Date.now()}-${process.env.GITHUB_RUN_ID ?? "local"}`;
  const loginDomain = email.split("@")[1];
  if (!loginDomain) throw new Error("HQBASE_STAGING_OWNER_EMAIL must contain a domain.");
  const memberEmail = `kirill-${suffix}@${loginDomain}`;
  const memberPassword = `${password}Track1!`;
  const member = await createStagingMember(request, {
    email: memberEmail,
    password: memberPassword
  });
  const grant = await request.put("/api/mailbox-grants", {
    data: { mailboxId: mailbox?.id, userId: member.id, accessLevel: "read" }
  });
  expect(grant.status()).toBe(204);

  const memberRequest = await playwrightRequest.newContext({
    baseURL: stagingUrl,
    extraHTTPHeaders: accessHeaders()
  });
  try {
    const memberLogin = await memberRequest.post("/api/auth/sign-in/email", {
      data: { email: memberEmail, password: member.loginPassword, rememberMe: false },
      headers: { origin: stagingUrl }
    });
    expect(memberLogin.ok()).toBeTruthy();
    if (member.passwordSetupRequired) {
      const passwordSetup = await memberRequest.post("/api/me/password", {
        data: {
          confirmPassword: memberPassword,
          currentPassword: member.loginPassword,
          newPassword: memberPassword
        },
        headers: { origin: stagingUrl }
      });
      expect(passwordSetup.ok(), await passwordSetup.text()).toBeTruthy();
    }
    const visible = await memberRequest.get("/api/mailboxes");
    expect((await visible.json()) as Array<{ id: string }>).toEqual([
      expect.objectContaining({ id: mailbox?.id })
    ]);
    const revoke = await request.delete(`/api/mailbox-grants/${mailbox?.id}/${member.id}`);
    expect(revoke.status()).toBe(204);
    const hidden = await memberRequest.get("/api/mailboxes");
    expect(hidden.ok()).toBeTruthy();
    expect(await hidden.json()).toEqual([]);
  } finally {
    await memberRequest.dispose();
  }

  const diagnostics = await request.get("/api/operations/diagnostics");
  expect(diagnostics.ok()).toBeTruthy();
  await expect(diagnostics.json()).resolves.toMatchObject({ ready: true });
  const scan = await request.post("/api/operations/integrity-scan");
  expect(scan.status()).toBe(202);
});

async function createStagingMember(
  request: APIRequestContext,
  input: { email: string; password: string }
): Promise<{ id: string; loginPassword: string; passwordSetupRequired: boolean }> {
  const modernResponse = await request.post("/api/users", {
    data: {
      email: input.email,
      method: "temporary_password",
      name: "Kirill Track 1",
      role: "member"
    }
  });
  const modern = (await modernResponse.json()) as {
    error?: unknown;
    temporaryPassword?: string;
    user?: { id?: string };
  };
  if (modernResponse.status() === 201) {
    if (!modern.user?.id || !modern.temporaryPassword) {
      throw new Error(
        `Modern user creation returned an incomplete result: ${JSON.stringify(modern)}`
      );
    }
    return {
      id: modern.user.id,
      loginPassword: modern.temporaryPassword,
      passwordSetupRequired: true
    };
  }

  const rejection = JSON.stringify(modern);
  if (modernResponse.status() !== 400 || !rejection.includes("expected string")) {
    throw new Error(
      `Modern user creation failed unexpectedly (${modernResponse.status()}): ${rejection}`
    );
  }

  const legacyResponse = await request.post("/api/users", {
    data: {
      email: input.email,
      name: "Kirill Track 1",
      password: input.password,
      role: "member"
    }
  });
  const legacy = (await legacyResponse.json()) as { error?: unknown; id?: string };
  if (legacyResponse.status() !== 201 || !legacy.id) {
    throw new Error(
      `Legacy user creation failed (${legacyResponse.status()}): ${JSON.stringify(legacy)}`
    );
  }
  return { id: legacy.id, loginPassword: input.password, passwordSetupRequired: false };
}

function accessHeaders(): Record<string, string> {
  const clientId = process.env.HQBASE_STAGING_ACCESS_CLIENT_ID;
  const clientSecret = process.env.HQBASE_STAGING_ACCESS_CLIENT_SECRET;
  return clientId && clientSecret
    ? { "CF-Access-Client-Id": clientId, "CF-Access-Client-Secret": clientSecret }
    : {};
}

function stagingSetupGrantCookie(secret: string): string {
  const iv = randomBytes(12);
  const key = createHash("sha256").update(`hqbase-runtime-cloudflare-oauth:${secret}`).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update("hqbase-staging-oauth-grant", "utf8"),
    cipher.final(),
    cipher.getAuthTag()
  ]);
  return `hqb_cf_oauth_grant=${encodeURIComponent(`${iv.toString("base64url")}.${encrypted.toString("base64url")}`)}`;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for HQBase staging E2E.`);
  return value;
}
