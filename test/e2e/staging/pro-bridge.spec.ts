import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const run = promisify(execFile);
const email = required("HQBASE_PRO_STAGING_OWNER_EMAIL");
const password = required("HQBASE_PRO_STAGING_OWNER_PASSWORD");
const sender = required("HQBASE_PRO_STAGING_SENDER");
const domain = required("HQBASE_PRO_STAGING_EMAIL_DOMAIN");
const bridgeToken = required("HQBASE_PRO_STAGING_BRIDGE_TOKEN");
const bridgeHost = required("HQBASE_PRO_STAGING_BRIDGE_HOST");
const acceptanceBinary = required("HQBASE_BRIDGE_ACCEPTANCE_BIN");

test("Pro app password works through real IMAPS and SMTPS", async ({ request }) => {
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
  }

  const login = await request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: false }
  });
  expect(login.ok()).toBeTruthy();
  const createdResponse = await request.post("/api/pro/app-passwords", {
    data: { name: `staging-e2e-${Date.now()}` }
  });
  expect(createdResponse.status()).toBe(201);
  const created = (await createdResponse.json()) as {
    appPassword: { id: string };
    password: string;
  };

  try {
    const authenticate = await request.post("/api/pro/mail-bridge/v1/authenticate", {
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

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Pro staging E2E.`);
  return value;
}
