import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const run = promisify(execFile);
const email = process.env.HQBASE_PRO_STAGING_OWNER_EMAIL ?? "";
const password = process.env.HQBASE_PRO_STAGING_OWNER_PASSWORD ?? "";
const sender = process.env.HQBASE_PRO_STAGING_SENDER ?? "";
const bridgeToken = process.env.HQBASE_PRO_STAGING_BRIDGE_TOKEN ?? "";
const bridgeHost = process.env.HQBASE_PRO_STAGING_BRIDGE_HOST ?? "";
const acceptanceBinary = process.env.HQBASE_BRIDGE_ACCEPTANCE_BIN ?? "";
const stagingUrl = process.env.HQBASE_PRO_STAGING_URL ?? "";

test.skip("Dormant bridge remains available after lifecycle changes", async ({ request }) => {
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
