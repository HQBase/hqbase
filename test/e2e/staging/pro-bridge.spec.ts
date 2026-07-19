import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, request as playwrightRequest, test } from "@playwright/test";

const run = promisify(execFile);
const email = required("HQBASE_PRO_STAGING_OWNER_EMAIL");
const password = required("HQBASE_PRO_STAGING_OWNER_PASSWORD");
const sender = required("HQBASE_PRO_STAGING_SENDER");
const domain = required("HQBASE_PRO_STAGING_EMAIL_DOMAIN");
const bridgeToken = required("HQBASE_PRO_STAGING_BRIDGE_TOKEN");
const bridgeHost = required("HQBASE_PRO_STAGING_BRIDGE_HOST");
const acceptanceBinary = required("HQBASE_BRIDGE_ACCEPTANCE_BIN");
const stagingUrl = required("HQBASE_PRO_STAGING_URL");

test("Pro app password works through real IMAPS and SMTPS", async ({ page, request }) => {
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
    const bootstrap = await request.post("/api/setup/bootstrap", {
      data: {
        checklistAcknowledged: true,
        mailboxes: [{ address: sender, displayName: "HQBase Pro E2E" }],
        ownerEmail: email,
        ownerName: "HQBase Pro E2E Owner",
        ownerPassword: password,
        primaryDomain: domain
      }
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
  const compose = page.getByRole("button", { name: "Compose" });
  const loginEmail = page.getByLabel("Email");
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      loginEmail.or(compose),
      "Pro app shell renders its authenticated state"
    ).toBeVisible({ timeout: 60_000 });
  } catch (error) {
    const shell = await page.evaluate(() => ({
      path: window.location.pathname,
      rootChildren: document.querySelector("#root")?.childElementCount ?? -1,
      scripts: [...document.scripts].map((script) => new URL(script.src).pathname),
      title: document.title
    }));
    console.error("Pro app shell diagnostics", { appShellErrors, shell });
    throw error;
  }
  if (await loginEmail.isVisible()) {
    await loginEmail.fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(compose).toBeVisible();
  const expectedUpdate = process.env.HQBASE_PRO_STAGING_EXPECT_UPDATE_VERSION;
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
      await page.reload();
      await expect(page.getByText("Update available", { exact: true })).toBeVisible({
        timeout: 15_000
      });
    }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    await expect(page.getByText(`HQBase ${expectedUpdate}`, { exact: false })).toBeVisible({
      timeout: 60_000
    });
  }
  const createdResponse = await request.post("/api/pro/app-passwords", {
    data: { name: `staging-e2e-${Date.now()}` }
  });
  expect(createdResponse.status()).toBe(201);
  const created = (await createdResponse.json()) as {
    appPassword: { id: string };
    password: string;
  };

  try {
    const authenticate = await request.post("/api/pro/mail-bridge/v2/authenticate", {
      headers: { authorization: `Bearer ${bridgeToken}` },
      data: { username: email, password: created.password }
    });
    expect(authenticate.ok()).toBeTruthy();
    await run(acceptanceBinary, [
      "-host",
      bridgeHost,
      "-username",
      email,
      "-password",
      created.password,
      "-from",
      sender
    ]);
  } finally {
    await request.delete(`/api/pro/app-passwords/${created.appPassword.id}`);
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
  const memberEmail = `kirill-${suffix}@${domain}`;
  const memberPassword = `${password}Track1!`;
  const createUser = await request.post("/api/users", {
    data: { email: memberEmail, name: "Kirill Track 1", password: memberPassword, role: "member" }
  });
  const member = (await createUser.json()) as { id?: string; error?: unknown };
  expect(createUser.status(), JSON.stringify(member)).toBe(201);
  expect(member.id).toBeTruthy();
  const grant = await request.put("/api/pro/mailbox-grants", {
    data: { mailboxId: mailbox?.id, userId: member.id, accessLevel: "read" }
  });
  expect(grant.status()).toBe(204);

  const memberRequest = await playwrightRequest.newContext({
    baseURL: stagingUrl,
    extraHTTPHeaders: accessHeaders()
  });
  try {
    const memberLogin = await memberRequest.post("/api/auth/sign-in/email", {
      data: { email: memberEmail, password: memberPassword, rememberMe: false },
      headers: { origin: stagingUrl }
    });
    expect(memberLogin.ok()).toBeTruthy();
    const visible = await memberRequest.get("/api/mailboxes");
    expect((await visible.json()) as Array<{ id: string }>).toEqual([
      expect.objectContaining({ id: mailbox?.id })
    ]);
    const appPassword = await memberRequest.post("/api/pro/app-passwords", {
      data: { name: "Track 1 read-only", expiresInDays: 30 }
    });
    expect(appPassword.status()).toBe(201);
    const credential = (await appPassword.json()) as {
      appPassword: { id: string };
      password: string;
    };
    const bridgeAuth = await memberRequest.post("/api/pro/mail-bridge/v2/authenticate", {
      headers: { authorization: `Bearer ${bridgeToken}` },
      data: { username: memberEmail, password: credential.password }
    });
    expect(bridgeAuth.status()).toBe(200);
    const bridgeSession = (await bridgeAuth.json()) as {
      accessToken: string;
      allowedFrom: string[];
      mailboxes: Array<{ id: string; name: string }>;
    };
    expect(bridgeSession.allowedFrom).toEqual([]);

    const revoke = await request.delete(`/api/pro/mailbox-grants/${mailbox?.id}/${member.id}`);
    expect(revoke.status()).toBe(204);
    const inbox = bridgeSession.mailboxes.find((item) => item.name === "INBOX");
    const stale = await memberRequest.get(
      `/api/pro/mail-bridge/v2/mailboxes/${inbox?.id}/messages`,
      {
        headers: {
          authorization: `Bearer ${bridgeToken}`,
          "x-hqbase-mail-session": bridgeSession.accessToken
        }
      }
    );
    expect(stale.status()).toBe(401);
  } finally {
    await memberRequest.dispose();
  }

  const diagnostics = await request.get("/api/pro/operations/diagnostics");
  expect(diagnostics.ok()).toBeTruthy();
  await expect(diagnostics.json()).resolves.toMatchObject({ ready: true });
  const scan = await request.post("/api/pro/operations/integrity-scan");
  expect(scan.status()).toBe(202);
});

function accessHeaders(): Record<string, string> {
  const clientId = process.env.HQBASE_PRO_STAGING_ACCESS_CLIENT_ID;
  const clientSecret = process.env.HQBASE_PRO_STAGING_ACCESS_CLIENT_SECRET;
  return clientId && clientSecret
    ? { "CF-Access-Client-Id": clientId, "CF-Access-Client-Secret": clientSecret }
    : {};
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Pro staging E2E.`);
  return value;
}
