import { expect, test } from "@playwright/test";

const token = required("HQBASE_STAGING_CLOUDFLARE_TOKEN");
const domain = required("HQBASE_STAGING_EMAIL_DOMAIN");
const ownerPassword = required("HQBASE_STAGING_OWNER_PASSWORD");
const ownerEmail = "community.owner.e2e@gmail.com";
const sender = `hello@${domain}`;
const recipient = `owner@${domain}`;

test("fresh Community installation can create an owner and send mail", async ({
  page,
  request
}) => {
  test.setTimeout(180_000);
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
  expect(
    (await request.post("/api/setup/cloudflare/token", { data: { apiToken: token } })).ok()
  ).toBeTruthy();
  const zonesResponse = await request.post("/api/setup/cloudflare/zones", {
    data: { apiToken: token }
  });
  const zones = (await zonesResponse.json()) as { zones: { id: string; name: string }[] };
  const zone = zones.zones.find(
    (candidate) => candidate.name === domain || domain.endsWith(`.${candidate.name}`)
  );
  expect(zone, `Cloudflare token must expose the parent zone for ${domain}`).toBeTruthy();
  const setup = (await (await request.get("/api/setup/status")).json()) as { isComplete: boolean };
  if (!setup.isComplete) {
    const bootstrapResponse = await request.post("/api/setup/bootstrap", {
      data: {
        checklistAcknowledged: true,
        mailboxes: [{ address: sender, displayName: "HQBase E2E" }],
        ownerEmail,
        ownerName: "HQBase E2E Owner",
        ownerPassword,
        primaryDomain: domain
      }
    });
    expect(bootstrapResponse.ok()).toBeTruthy();
    expect(await bootstrapResponse.json()).toMatchObject({
      owner: { email: ownerEmail },
      mailboxes: [{ address: sender }],
      setup: { mailboxCount: 1 }
    });
  }

  const compose = page.getByRole("button", { name: "Compose" });
  const email = page.getByLabel("Email");
  await expect(async () => {
    await page.goto("/");
    await expect(email.or(compose)).toBeVisible({ timeout: 15_000 });
  }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 90_000 });
  if (await email.isVisible()) {
    await email.fill(ownerEmail);
    await page.getByLabel("Password").fill(ownerPassword);
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await expect(compose).toBeVisible();
  const expectedUpdate = process.env.HQBASE_STAGING_EXPECT_UPDATE_VERSION;
  if (expectedUpdate) {
    await expect
      .poll(
        async () => {
          const response = await request.get("/api/updates");
          const body = await response.text();
          if (!response.ok()) {
            return { body, status: response.status() };
          }
          const update = JSON.parse(body) as {
            available?: boolean;
            release?: { version?: string };
          };
          return {
            available: update.available,
            status: response.status(),
            version: update.release?.version
          };
        },
        { timeout: 60_000 }
      )
      .toEqual({ available: true, status: 200, version: expectedUpdate });
    await page.reload();
    await expect(page.getByText("Update available", { exact: true })).toBeVisible({
      timeout: 60_000
    });
    await expect(page.getByText(`HQBase ${expectedUpdate}`, { exact: false })).toBeVisible({
      timeout: 60_000
    });
  }
  const sendResponse = await page.request.post("/api/send", {
    data: {
      from: sender,
      to: [recipient],
      cc: [],
      bcc: [],
      subject: `HQBase staging ${Date.now()}`,
      text: "Community staging lifecycle passed."
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
