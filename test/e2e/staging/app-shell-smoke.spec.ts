import { type APIRequestContext, expect, test } from "@playwright/test";

const stagingUrl = process.env.HQBASE_STAGING_URL ?? "";
const oauthClientId = process.env.HQBASE_STAGING_OAUTH_CLIENT_ID ?? "";

test("deployed HQBase PWA shell is ready", async ({ page, request }) => {
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

  await expect(async () => {
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBeTruthy();
    expect(await manifestResponse.json()).toMatchObject({
      display: "standalone",
      name: "HQBase",
      start_url: "/"
    });

    const serviceWorkerResponse = await request.get("/service-worker.js");
    expect(serviceWorkerResponse.ok()).toBeTruthy();
    expect(await serviceWorkerResponse.text()).toContain('"/offline.html"');
    expect((await request.get("/offline.html")).ok()).toBeTruthy();

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/HQBase/);
    await expect(page.locator("#root > *")).toBeVisible({ timeout: 10_000 });
  }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
});

test("deployed HQBase publishes the v2 Mail API OAuth resource", async ({ request }) => {
  const origin = new URL(stagingUrl).origin;
  const metadata = await getSuccessfulResponseBody(
    request,
    "/.well-known/oauth-protected-resource/api/v2"
  );
  expect(JSON.parse(metadata)).toMatchObject({
    resource: `${origin}/api/v2`,
    authorization_servers: [`${origin}/api/auth`],
    scopes_supported: ["mail:read", "mail:write", "mail:send", "signatures:manage"]
  });

  const v1Metadata = await getSuccessfulResponseBody(
    request,
    "/.well-known/oauth-protected-resource/api/v1"
  );
  expect(JSON.parse(v1Metadata)).toMatchObject({
    resource: `${origin}/api/v1`,
    authorization_servers: [`${origin}/api/auth`],
    scopes_supported: ["mail:read", "mail:write", "mail:send", "signatures:manage"]
  });

  const v1OpenApi = await getSuccessfulResponseBody(request, "/api/v1/openapi.json");
  expect(JSON.parse(v1OpenApi)).toMatchObject({
    info: { version: "1.0.0" },
    paths: { "/api/v1/mailboxes": expect.any(Object) }
  });

  const authorization = await getSuccessfulResponseBody(
    request,
    "/.well-known/oauth-authorization-server/api/auth"
  );
  expect(JSON.parse(authorization)).toMatchObject({
    device_authorization_endpoint: `${origin}/api/auth/device/code`,
    token_endpoint: `${origin}/api/auth/oauth2/token`,
    grant_types_supported: expect.arrayContaining(["urn:ietf:params:oauth:grant-type:device_code"])
  });

  const skillText = await getSuccessfulResponseBody(request, "/skills/hqbase-mail/SKILL.md");
  expect(skillText).toMatch(/^---\nname: hqbase-mail\ndescription: [^\n]+\n---/);
  expect(skillText).toContain("Prefer Device Authorization");
  expect(skillText).toContain(
    "Do not open, navigate to, or interact with the verification URL in Cloud Browser"
  );

  const mailboxSkill = await getSuccessfulResponseBody(request, "/skills/hqbase-mailbox/SKILL.md");
  expect(mailboxSkill).toMatch(/^---\nname: hqbase-mailbox\ndescription: [^\n]+\n---/);
  expect(mailboxSkill).toContain(`${origin}/api/v2/openapi.json`);

  const provisionerSkill = await getSuccessfulResponseBody(
    request,
    "/skills/hqbase-provisioner/SKILL.md"
  );
  expect(provisionerSkill).toMatch(/^---\nname: hqbase-provisioner\ndescription: [^\n]+\n---/);
  expect(provisionerSkill).toContain(`${origin}/management/v1`);
  expect(provisionerSkill).toContain(`DELETE ${origin}/management/v1/agents/{agent-id}`);

  const retiredInstructions = await getSuccessfulResponseBody(request, "/agents.md");
  expect(retiredInstructions).toContain("Open **Agents** in HQBase");
});

test("customer-managed OAuth starts directly with the exact staging callback", async ({
  request
}) => {
  expect(oauthClientId).not.toBe("");
  const response = await request.get("/api/setup/cloudflare/oauth/start", {
    maxRedirects: 0
  });
  const target = new URL(response.headers().location ?? "");

  expect(response.status()).toBe(303);
  expect(target.origin).toBe("https://dash.cloudflare.com");
  expect(target.pathname).toBe("/oauth2/auth");
  expect(target.searchParams.get("client_id")).toBe(oauthClientId);
  expect(target.searchParams.get("redirect_uri")).toBe(
    `${new URL(stagingUrl).origin}/api/setup/cloudflare/oauth/callback`
  );
  expect(target.searchParams.get("scope")).toContain("email-routing-rule.write");
  expect(target.searchParams.get("code_challenge_method")).toBe("S256");
});

async function getSuccessfulResponseBody(
  request: APIRequestContext,
  path: string
): Promise<string> {
  const response = await request.get(path);
  const body = await response.text();
  const excerpt = body.slice(0, 1_000).replaceAll("\u0000", "\\0");
  expect(
    response.status(),
    `${path} returned HTTP ${response.status()} ${response.statusText()}\n${excerpt}`
  ).toBe(200);
  return body;
}
