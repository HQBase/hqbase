import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { expect, test } from "@playwright/test";
import { ensureStagingSetup } from "./setup";

test("a native v1 client manages signatures and refreshes after browser sign-out", async ({
  request
}) => {
  await ensureStagingSetup(request);
  const origin = new URL(process.env.HQBASE_STAGING_URL ?? "https://staging.invalid").origin;
  const login = () =>
    request.post("/api/auth/sign-in/email", {
      data: {
        email: process.env.HQBASE_STAGING_OWNER_EMAIL,
        password: process.env.HQBASE_STAGING_OWNER_PASSWORD
      },
      headers: { origin }
    });
  expect((await login()).status()).toBe(200);
  const me = await request.get("/api/me");
  expect(me.status()).toBe(200);
  const person = (await me.json()) as { id: string };
  const resource = `${origin}/api/v1`;
  const scope = "mail:read mail:send signatures:manage offline_access";
  const registration = await request.post("/api/auth/oauth2/register", {
    data: {
      application_type: "native",
      client_name: "HQBase native client staging test",
      grant_types: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
      resources: [resource],
      scope,
      token_endpoint_auth_method: "none"
    }
  });
  expect(registration.status()).toBe(201);
  const client = (await registration.json()) as { client_id: string };
  const device = await request.post("/api/auth/device/code", {
    form: { client_id: client.client_id, resource, scope }
  });
  expect(device.status()).toBe(200);
  const code = (await device.json()) as { device_code: string; user_code: string };
  expect(
    (await request.get(`/api/auth/device?user_code=${encodeURIComponent(code.user_code)}`)).status()
  ).toBe(200);
  expect(
    (
      await request.post("/api/auth/device/approve", { data: { userCode: code.user_code } })
    ).status()
  ).toBe(200);
  const issued = await request.post("/api/auth/oauth2/token", {
    form: {
      client_id: client.client_id,
      device_code: code.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      resource
    }
  });
  expect(issued.status()).toBe(200);
  const token = (await issued.json()) as { access_token: string; refresh_token: string };
  let headers = { authorization: `Bearer ${token.access_token}` };
  let signatureId: string | undefined;
  let draftId: string | undefined;
  try {
    const signature = await request.post("/api/v1/signatures", {
      headers,
      data: {
        name: `Native staging ${crypto.randomUUID()}`,
        html: "<p>Saved staging signature</p>",
        scope: { type: "user", id: person.id }
      }
    });
    expect(signature.status()).toBe(201);
    signatureId = ((await signature.json()) as { id: string }).id;
    expect(
      (
        await request.patch(`/api/v1/signatures/${signatureId}`, {
          headers,
          data: { html: "<p>Changed staging signature</p>" }
        })
      ).status()
    ).toBe(200);
    const managed = await request.get("/api/v1/signatures/manage", { headers });
    expect(managed.status()).toBe(200);
    expect(await managed.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: signatureId })])
    );
    const draft = await request.post("/api/v1/drafts", {
      headers,
      data: {
        from: process.env.HQBASE_STAGING_SENDER,
        subject: "Native staging draft",
        signature: { mode: "selected", id: signatureId }
      }
    });
    expect(draft.status()).toBe(201);
    draftId = ((await draft.json()) as { id: string }).id;
    expect((await request.delete(`/api/v1/signatures/${signatureId}`, { headers })).status()).toBe(
      204
    );
    signatureId = undefined;
    const saved = await request.get(`/api/v1/drafts/${draftId}`, { headers });
    expect(saved.status()).toBe(200);
    const savedDraft = await saved.json();
    expect(savedDraft).toMatchObject({
      signature: { mode: "selected", id: null, text: "Changed staging signature" },
      labels: []
    });
    const contract = await request.get("/api/v1/openapi.json");
    expect(contract.status()).toBe(200);
    const document = await contract.json();
    const draftSchema = {
      $ref: "#/components/schemas/Draft",
      components: document.components
    };
    const validate = new AjvJsonSchemaValidator().getValidator(draftSchema);
    expect(validate(savedDraft).valid).toBe(true);
    for (const path of ["messages", "conversations", "changes"]) {
      expect((await request.get(`/api/v1/${path}?includeLabels=true`, { headers })).status()).toBe(
        200
      );
    }
    expect((await request.post("/api/auth/sign-out")).status()).toBe(200);
    const refreshed = await request.post("/api/auth/oauth2/token", {
      form: {
        client_id: client.client_id,
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
        resource
      }
    });
    expect(refreshed.status()).toBe(200);
    const next = (await refreshed.json()) as { access_token: string };
    headers = { authorization: `Bearer ${next.access_token}` };
    expect((await request.get("/api/v1/mailboxes", { headers })).status()).toBe(200);
    expect((await request.get(`/api/v1/drafts/${draftId}`, { headers })).status()).toBe(200);
  } finally {
    expect((await login()).status()).toBe(200);
    if (draftId) expect((await request.delete(`/api/v1/drafts/${draftId}`)).status()).toBe(204);
    if (signatureId)
      expect((await request.delete(`/api/v1/signatures/${signatureId}`)).status()).toBe(204);
    expect((await request.delete(`/api/oauth-connections/${client.client_id}`)).status()).toBe(204);
  }
  expect((await request.get("/api/v1/mailboxes", { headers })).status()).toBe(401);
});
