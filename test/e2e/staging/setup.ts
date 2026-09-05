import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { type APIRequestContext, expect } from "@playwright/test";

// Each authenticated probe also works on a fresh disposable installation.
export async function ensureStagingSetup(request: APIRequestContext): Promise<void> {
  const stagingUrl = required("HQBASE_STAGING_URL");
  const status = await request.get("/api/setup/status");
  expect(status.ok()).toBeTruthy();
  const setup = (await status.json()) as { isComplete: boolean };
  if (!setup.isComplete) {
    const email = required("HQBASE_STAGING_OWNER_EMAIL");
    const password = required("HQBASE_STAGING_OWNER_PASSWORD");
    const sender = required("HQBASE_STAGING_SENDER");
    const domain = required("HQBASE_STAGING_EMAIL_DOMAIN");
    const grantCookie = stagingSetupGrantCookie(required("HQBASE_STAGING_AUTH_SECRET"));
    const bootstrap = await request.post("/api/setup/bootstrap", {
      data: {
        checklistAcknowledged: true,
        defaultFromMailboxAddress: sender,
        emailDomains: [
          {
            catchAllMailboxAddress: sender,
            catchAllPolicy: "mailbox",
            name: domain
          }
        ],
        mailboxes: [{ address: sender, displayName: "HQBase E2E" }],
        ownerEmail: email,
        ownerName: "HQBase E2E Owner",
        ownerPassword: password,
        portalHostname: new URL(stagingUrl).hostname,
        primaryDomain: domain
      },
      headers: { cookie: grantCookie, origin: new URL(stagingUrl).origin }
    });
    expect(bootstrap.status()).toBe(201);
    await expect(bootstrap.json()).resolves.toMatchObject({ setup: { isComplete: true } });
  }
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
  if (!value) throw new Error(`${name} is required for HQBase staging setup.`);
  return value;
}
