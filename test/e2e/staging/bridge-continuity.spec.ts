import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const run = promisify(execFile);
const email = required("HQBASE_PRO_STAGING_OWNER_EMAIL");
const password = required("HQBASE_PRO_STAGING_OWNER_PASSWORD");
const sender = required("HQBASE_PRO_STAGING_SENDER");
const bridgeToken = required("HQBASE_PRO_STAGING_BRIDGE_TOKEN");
const bridgeHost = required("HQBASE_PRO_STAGING_BRIDGE_HOST");
const acceptanceBinary = required("HQBASE_BRIDGE_ACCEPTANCE_BIN");
const stagingUrl = required("HQBASE_PRO_STAGING_URL");

test("Pro bridge remains available after lifecycle changes", async ({ request }) => {
  const login = await request.post("/api/auth/sign-in/email", {
    data: { email, password, rememberMe: false },
    headers: { origin: stagingUrl }
  });
  expect(
    login.ok(),
    `Owner API sign-in failed (${login.status()}): ${await login.text()}`
  ).toBeTruthy();

  const createdResponse = await request.post("/api/pro/app-passwords", {
    data: { name: `staging-continuity-${Date.now()}` }
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

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Pro staging E2E.`);
  return value;
}
