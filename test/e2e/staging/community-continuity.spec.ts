import { expect, test } from "@playwright/test";

const domain = required("HQBASE_STAGING_EMAIL_DOMAIN");
const ownerPassword = required("HQBASE_STAGING_OWNER_PASSWORD");
const stagingUrl = required("HQBASE_STAGING_URL");
const ownerEmail = "community.owner.e2e@gmail.com";
const sender = `hello@${domain}`;
const recipient = `owner@${domain}`;

test("Community mail remains available after lifecycle changes", async ({ request }) => {
  const login = await request.post("/api/auth/sign-in/email", {
    data: { email: ownerEmail, password: ownerPassword, rememberMe: false },
    headers: { origin: stagingUrl }
  });
  expect(
    login.ok(),
    `Owner API sign-in failed (${login.status()}): ${await login.text()}`
  ).toBeTruthy();

  const sendResponse = await request.post("/api/send", {
    data: {
      from: sender,
      to: [recipient],
      cc: [],
      bcc: [],
      subject: `HQBase staging continuity ${Date.now()}`,
      text: "Community staging continuity passed."
    }
  });
  expect(sendResponse.status()).toBe(201);
  expect(await sendResponse.json()).toMatchObject({ folder: "sent", fromAddress: sender });
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for staging E2E.`);
  return value;
}
