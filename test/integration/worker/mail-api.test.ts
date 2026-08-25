import { env, runDurableObjectAlarm, runInDurableObject, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createAuth } from "../../../worker/auth/auth";
import { draftAttachmentObjects } from "../../../worker/features/drafts/attachment-lookups";
import { mailEventInternalHeaders } from "../../../worker/features/events/durable-object";
import { applyCurrentMigrations } from "./current-migrations";
import { tokenRow } from "./mail-api-token-fixture";

const origin = "https://hqbase.test";
const apiResource = `${origin}/api/v2`;
const v1ApiResource = `${origin}/api/v1`;
const readToken = "hqb_access_mail-api-read-token";
const v1ReadToken = "hqb_access_mail-api-v1-read-token";
const writeToken = "hqb_access_mail-api-write-token";
const fullToken = "hqb_access_mail-api-full-token";
const wrongAudienceToken = "hqb_access_mail-api-wrong-audience-token";
const revokedToken = "hqb_access_mail-api-revoked-token";
const scopes = ["mail:read", "mail:write", "mail:send"];
let cookie = "";
let userId = "";

describe("HQBase Mail API", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();

    const auth = createAuth(env, new Request(`${origin}/api/auth/sign-up/email`));
    const signUp = await auth.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email: "api-member@login.example",
          name: "API Member",
          password: "mail-api-test-password",
          rememberMe: false
        }),
        headers: { "content-type": "application/json", origin },
        method: "POST"
      })
    );
    expect(signUp.status, await signUp.clone().text()).toBe(200);
    cookie = extractSessionCookie(signUp);

    const user = await env.DB.prepare(
      `SELECT u.id, s.id AS sessionId
       FROM "user" u JOIN "session" s ON s.userId = u.id
       WHERE u.email = ? ORDER BY s.createdAt DESC LIMIT 1`
    )
      .bind("api-member@login.example")
      .first<{ id: string; sessionId: string }>();
    if (!user) throw new Error("API test user was not created.");
    userId = user.id;

    const now = new Date();
    const future = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const tokenRows = await Promise.all([
      tokenRow(
        env.DB,
        "tok_api_read",
        readToken,
        "client_mail_api",
        user.sessionId,
        userId,
        future,
        ["mail:read"],
        apiResource
      ),
      tokenRow(
        env.DB,
        "tok_api_v1_read",
        v1ReadToken,
        "client_mail_api_v1",
        user.sessionId,
        userId,
        future,
        ["mail:read"],
        v1ApiResource
      ),
      tokenRow(
        env.DB,
        "tok_api_write",
        writeToken,
        "client_mail_api",
        user.sessionId,
        userId,
        future,
        ["mail:write"],
        apiResource
      ),
      tokenRow(
        env.DB,
        "tok_api_full",
        fullToken,
        "client_mail_api",
        user.sessionId,
        userId,
        future,
        scopes,
        apiResource
      ),
      tokenRow(
        env.DB,
        "tok_api_wrong",
        wrongAudienceToken,
        "client_mail_mcp",
        user.sessionId,
        userId,
        future,
        ["mail:read"],
        `${origin}/mcp`
      ),
      tokenRow(
        env.DB,
        "tok_api_revoked",
        revokedToken,
        "client_mail_api",
        user.sessionId,
        userId,
        future,
        scopes,
        apiResource,
        now.toISOString()
      )
    ]);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
         VALUES ('dom_api', 'example.com', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mailboxes
         (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_api', 'support@example.com', 'dom_api', 'Support', 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at)
         VALUES ('mbx_api', ?, 'agent', ?, ?, ?)`
      ).bind(userId, userId, now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO oauthClient
         (id, clientId, disabled, redirectUris, public, requirePKCE, createdAt, updatedAt)
         VALUES ('client_row_api', 'client_mail_api', 0, ?, 1, 1, ?, ?)`
      ).bind(
        JSON.stringify(["https://client.example/callback"]),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO oauthConsent
         (id, clientId, userId, scopes, resources, createdAt, updatedAt)
         VALUES ('consent_api', 'client_mail_api', ?, ?, ?, ?, ?)`
      ).bind(
        userId,
        JSON.stringify(scopes),
        JSON.stringify([apiResource]),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO oauthClient
         (id, clientId, disabled, redirectUris, public, requirePKCE, createdAt, updatedAt)
         VALUES ('client_row_api_v1', 'client_mail_api_v1', 0, ?, 1, 1, ?, ?)`
      ).bind(
        JSON.stringify(["https://client.example/v1/callback"]),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO oauthConsent
         (id, clientId, userId, scopes, resources, createdAt, updatedAt)
         VALUES ('consent_api_v1', 'client_mail_api_v1', ?, ?, ?, ?, ?)`
      ).bind(
        userId,
        JSON.stringify(["mail:read"]),
        JSON.stringify([v1ApiResource]),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO oauthClient
         (id, clientId, disabled, redirectUris, public, requirePKCE, createdAt, updatedAt)
         VALUES ('client_row_mcp', 'client_mail_mcp', 0, ?, 1, 1, ?, ?)`
      ).bind(JSON.stringify(["https://client.example/mcp"]), now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO oauthConsent
         (id, clientId, userId, scopes, resources, createdAt, updatedAt)
         VALUES ('consent_mcp_for_api', 'client_mail_mcp', ?, ?, ?, ?, ?)`
      ).bind(
        userId,
        JSON.stringify(["mail:read"]),
        JSON.stringify([`${origin}/mcp`]),
        now.toISOString(),
        now.toISOString()
      ),
      ...tokenRows,
      env.DB.prepare(
        `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
         VALUES
           ('thr_api', 'api message', ?, ?, ?),
           ('thr_api_unassigned', 'api unassigned', ?, ?, ?),
           ('thr_api_orphan', 'api orphan', ?, ?, ?)`
      ).bind(
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO messages
         (id, thread_id, mailbox_id, direction, folder, from_address, from_name, to_json, cc_json, bcc_json,
          subject, snippet, text_body, html_r2_key, message_id, dedupe_key, in_reply_to, references_json,
          received_at, sent_at, read_at, has_attachments, created_at, updated_at)
         VALUES ('msg_api', 'thr_api', 'mbx_api', 'inbound', 'inbox', 'sender@example.net', 'Sender Example', ?,
                 '[]', '[]', 'API message', 'Body', 'Body', 'mail/api/body.html',
                 '<api@example.net>', 'api-dedupe',
                 NULL, '[]', ?, NULL, NULL, 1, ?, ?)`
      ).bind(
        JSON.stringify(["support@example.com"]),
        now.toISOString(),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO messages
         (id, thread_id, mailbox_id, is_unassigned, direction, folder, from_address,
          to_json, cc_json, bcc_json, subject, snippet, text_body, references_json,
          received_at, has_attachments, created_at, updated_at)
         VALUES
           ('msg_api_unassigned', 'thr_api_unassigned', NULL, 1, 'inbound', 'catchall',
            'sender@example.net', '[]', '[]', '[]', 'Unassigned', 'Body', 'Body', '[]', ?, 0, ?, ?),
           ('msg_api_orphan', 'thr_api_orphan', NULL, 0, 'inbound', 'inbox',
            'sender@example.net', '[]', '[]', '[]', 'Orphan', 'Body', 'Body', '[]', ?, 0, ?, ?)`
      ).bind(
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO message_attachments
         (id, message_id, filename, content_type, size_bytes, content_id, r2_key, created_at)
         VALUES ('att_api', 'msg_api', 'hello.txt', 'text/plain', 5, NULL, 'mail/api/hello.txt', ?)`
      ).bind(now.toISOString())
    ]);
    await env.MAIL_OBJECTS.put("mail/api/hello.txt", "hello", {
      httpMetadata: { contentType: "text/plain" }
    });
    await env.MAIL_OBJECTS.put(
      "mail/api/body.html",
      '<p>Visible before</p><div class="gmail_quote"><p>Earlier reply</p></div><p>Visible after</p>',
      { httpMetadata: { contentType: "text/html; charset=utf-8" } }
    );
  });

  it("publishes protected-resource metadata and a scoped authentication challenge", async () => {
    const metadata = await SELF.fetch(`${origin}/.well-known/oauth-protected-resource/api/v2`);
    expect(metadata.status).toBe(200);
    await expect(metadata.json()).resolves.toMatchObject({
      resource: apiResource,
      authorization_servers: [`${origin}/api/auth`],
      scopes_supported: scopes,
      resource_name: "HQBase Mail API",
      resource_documentation: `${origin}/skills/hqbase-mail/SKILL.md`
    });

    const v1Metadata = await SELF.fetch(`${origin}/.well-known/oauth-protected-resource/api/v1`);
    expect(v1Metadata.status).toBe(200);
    await expect(v1Metadata.json()).resolves.toMatchObject({
      resource: v1ApiResource,
      authorization_servers: [`${origin}/api/auth`],
      scopes_supported: scopes
    });

    const rejected = await SELF.fetch(`${origin}/api/v2/messages`);
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("www-authenticate")).toContain(
      `resource_metadata="${origin}/.well-known/oauth-protected-resource/api/v2"`
    );
    expect(rejected.headers.get("www-authenticate")).toContain('scope="mail:read"');
    expect(rejected.headers.get("x-request-id")).toBeTruthy();

    const rejectedV1 = await SELF.fetch(`${origin}/api/v1/messages`);
    expect(rejectedV1.status).toBe(401);
    expect(rejectedV1.headers.get("www-authenticate")).toContain(
      `resource_metadata="${origin}/.well-known/oauth-protected-resource/api/v1"`
    );
  });

  it("publishes separate connection skills and versioned OpenAPI documents", async () => {
    const humanSkill = await SELF.fetch(`${origin}/skills/hqbase-mail/SKILL.md`);
    expect(humanSkill.status).toBe(200);
    expect(humanSkill.headers.get("content-type")).toContain("text/markdown");
    expect(humanSkill.headers.get("access-control-allow-origin")).toBe("*");
    const humanInstructions = await humanSkill.text();
    expect(humanInstructions).toMatch(
      /^---\nname: hqbase-mail\ndescription: [^\n]+\n---\n\n# HQBase Mail for Your Account/
    );
    expect(humanInstructions).toContain(`- Instance origin: ${origin}`);
    expect(humanInstructions).toContain(`- API base URL: ${apiResource}`);
    expect(humanInstructions).toContain(`- OpenAPI contract: ${origin}/api/v2/openapi.json`);
    expect(humanInstructions).toContain(`resource=${apiResource}`);
    expect(humanInstructions).toContain("urn:ietf:params:oauth:grant-type:device_code");
    expect(humanInstructions).toContain("verification_uri_complete");
    expect(humanInstructions).toContain("authorization_pending");
    expect(humanInstructions).toContain("Prefer Device Authorization");
    expect(humanInstructions).toContain(
      "Do not open, navigate to, or interact with the verification URL in Cloud Browser"
    );
    expect(humanInstructions).toContain(
      "The person must open it themselves in a browser they control"
    );
    expect(humanInstructions).toContain("Sending, replying, and forwarding are not idempotent");
    expect(humanInstructions).toContain(
      "get a checkpoint from `GET https://hqbase.test/api/v2/changes`"
    );
    expect(humanInstructions).not.toContain("credentials currently start with `hqb_agent_`");

    const mailboxSkill = await SELF.fetch(`${origin}/skills/hqbase-mailbox/SKILL.md`);
    expect(mailboxSkill.status).toBe(200);
    const mailboxInstructions = await mailboxSkill.text();
    expect(mailboxInstructions).toMatch(
      /^---\nname: hqbase-mailbox\ndescription: [^\n]+\n---\n\n# HQBase Mailbox Agent/
    );
    expect(mailboxInstructions).toContain(`- API base URL: ${apiResource}`);
    expect(mailboxInstructions).toContain("credentials currently start with `hqb_agent_`");
    expect(mailboxInstructions).toContain("only with the Mail API");
    expect(mailboxInstructions).not.toContain("device_authorization_endpoint");

    const provisionerSkill = await SELF.fetch(`${origin}/skills/hqbase-provisioner/SKILL.md`);
    expect(provisionerSkill.status).toBe(200);
    const provisionerInstructions = await provisionerSkill.text();
    expect(provisionerInstructions).toMatch(
      /^---\nname: hqbase-provisioner\ndescription: [^\n]+\n---\n\n# HQBase Provisioner/
    );
    expect(provisionerInstructions).toContain(`- Management API base URL: ${origin}/management/v1`);
    expect(provisionerInstructions).toContain(
      `- Child mailbox skill: ${origin}/skills/hqbase-mailbox/SKILL.md`
    );
    expect(provisionerInstructions).toContain(
      `POST ${origin}/management/v1/agents/{agent-id}/credential`
    );
    expect(provisionerInstructions).toContain(`DELETE ${origin}/management/v1/agents/{agent-id}`);
    expect(provisionerInstructions).toContain("cannot read or send mail");
    expect(provisionerInstructions).not.toContain("device_authorization_endpoint");

    for (const instructions of [humanInstructions, mailboxInstructions]) {
      expect(instructions).toContain("Sending, replying, and forwarding are not idempotent");
      expect(instructions).toContain(
        "get a checkpoint from `GET https://hqbase.test/api/v2/changes`"
      );
      expect(instructions).toContain("List mailboxes before each change cycle");
    }

    const openApi = await SELF.fetch(`${origin}/api/v2/openapi.json`);
    expect(openApi.status).toBe(200);
    expect(openApi.headers.get("content-type")).toContain("application/json");
    const document = (await openApi.json()) as {
      components: {
        securitySchemes: {
          agentBearer: { bearerFormat: string; scheme: string; type: string };
        };
      };
      externalDocs: { url: string };
      paths: Record<
        string,
        {
          get?: {
            security?: Array<Record<string, string[]>>;
            "x-hqbase-agent-capabilities"?: string[];
          };
          post?: { security?: Array<Record<string, string[]>> };
        }
      >;
      servers: Array<{ url: string }>;
    };
    expect(document.servers).toEqual([{ url: origin, description: "This HQBase installation" }]);
    expect(document.externalDocs.url).toBe(`${origin}/skills/hqbase-mail/SKILL.md`);
    expect(document.components.securitySchemes.agentBearer).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "hqb_agent_<secret>"
    });
    expect(document.paths["/api/v2/messages"]?.get?.security).toContainEqual({ agentBearer: [] });
    expect(document.paths["/api/v2/messages"]?.get).toMatchObject({
      "x-hqbase-agent-capabilities": ["mail:read"]
    });
    expect(
      document.paths["/api/v2/messages/{id}/remote-media/trust"]?.post?.security
    ).not.toContainEqual({ agentBearer: [] });

    const v1OpenApi = await SELF.fetch(`${origin}/api/v1/openapi.json`);
    expect(v1OpenApi.status).toBe(200);
    const v1Document = (await v1OpenApi.json()) as {
      components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
      info: { version: string };
      paths: Record<string, unknown>;
      servers: Array<{ url: string }>;
    };
    expect(v1Document.info.version).toBe("1.0.0");
    expect(v1Document.servers).toEqual([{ url: origin, description: "This HQBase installation" }]);
    expect(v1Document.paths["/api/v1/mailboxes"]).toBeDefined();
    expect(v1Document.components.schemas.MailboxAddress).toBeDefined();
    expect(v1Document.components.securitySchemes.agentBearer).toBeUndefined();

    for (const skillPath of [
      "/skills/hqbase-mail/SKILL.md",
      "/skills/hqbase-mailbox/SKILL.md",
      "/skills/hqbase-provisioner/SKILL.md"
    ]) {
      const head = await SELF.fetch(`${origin}${skillPath}`, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");

      const rejectedMethod = await SELF.fetch(`${origin}${skillPath}`, { method: "POST" });
      expect(rejectedMethod.status).toBe(405);
      expect(rejectedMethod.headers.get("allow")).toBe("GET, HEAD");
    }

    for (const retiredPath of ["/AGENTS.md", "/agents.md"]) {
      const retired = await SELF.fetch(`${origin}${retiredPath}`, { redirect: "manual" });
      expect(retired.status).toBe(200);
      expect(retired.headers.get("location")).toBeNull();
      expect(await retired.text()).toContain("Open **Settings → Connect AI agents** in HQBase");
    }
  });

  it("keeps v1 compatible while v2 uses direct mailboxes and legacy routes remain cookie-only", async () => {
    const versioned = await SELF.fetch(`${origin}/api/v2/mailboxes`, { headers: { cookie } });
    expect(versioned.status, await versioned.clone().text()).toBe(200);
    const v2Mailboxes = (await versioned.json()) as Array<Record<string, unknown>>;
    expect(v2Mailboxes).toMatchObject([{ id: "mbx_api", accessLevel: "agent" }]);
    expect(v2Mailboxes[0]).not.toHaveProperty("addresses");

    const v1Session = await SELF.fetch(`${origin}/api/v1/mailboxes`, { headers: { cookie } });
    expect(v1Session.status, await v1Session.clone().text()).toBe(200);
    await expect(v1Session.json()).resolves.toEqual([
      {
        id: "mbx_api",
        address: "support@example.com",
        addresses: [
          {
            id: "mbx_api",
            mailboxId: "mbx_api",
            mailDomainId: "dom_api",
            address: "support@example.com",
            displayName: "Support",
            receiveEnabled: true,
            sendEnabled: true,
            isPrimary: true
          }
        ],
        displayName: "Support",
        isActive: true,
        accessLevel: "agent",
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      }
    ]);

    const v1Bearer = await apiFetch("/api/v1/mailboxes", v1ReadToken);
    expect(v1Bearer.status, await v1Bearer.clone().text()).toBe(200);

    const v1TokenOnV2 = await apiFetch("/api/v2/mailboxes", v1ReadToken);
    expect(v1TokenOnV2.status).toBe(401);
    const v2TokenOnV1 = await apiFetch("/api/v1/mailboxes", readToken);
    expect(v2TokenOnV1.status).toBe(401);

    const legacyCookie = await SELF.fetch(`${origin}/api/messages`, { headers: { cookie } });
    expect(legacyCookie.status).toBe(200);
    const legacyBearer = await apiFetch("/api/messages", readToken);
    expect(legacyBearer.status).toBe(401);
  });

  it("opens an access-scoped wake-only WebSocket", async () => {
    const missingUpgrade = await apiFetch("/api/v2/events", readToken);
    expect(missingUpgrade.status).toBe(426);
    expect(missingUpgrade.headers.get("upgrade")).toBe("websocket");

    const v1MissingUpgrade = await apiFetch("/api/v1/events", v1ReadToken);
    expect(v1MissingUpgrade.status).toBe(426);
    expect(v1MissingUpgrade.headers.get("upgrade")).toBe("websocket");

    const v1Socket = await openEventSocket(
      { authorization: `Bearer ${v1ReadToken}`, upgrade: "websocket" },
      "/api/v1/events"
    );
    v1Socket.close(1000, "v1 compatibility verified");

    const insufficientScope = await apiFetch("/api/v2/events", writeToken, {
      headers: { upgrade: "websocket" }
    });
    expect(insufficientScope.status).toBe(403);
    expect(insufficientScope.headers.get("www-authenticate")).toContain('scope="mail:read"');

    const invalidOrigin = await SELF.fetch(`${origin}/api/v2/events`, {
      headers: { cookie, origin: "https://other.example", upgrade: "websocket" }
    });
    expect(invalidOrigin.status).toBe(403);
    await expect(invalidOrigin.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_FORBIDDEN" }
    });

    const missingOrigin = await SELF.fetch(`${origin}/api/v2/events`, {
      headers: { cookie, upgrade: "websocket" }
    });
    expect(missingOrigin.status).toBe(403);
    await expect(missingOrigin.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_FORBIDDEN" }
    });

    const sessionSocket = await openEventSocket({
      cookie,
      origin,
      upgrade: "websocket"
    });
    await closeEventSocket(sessionSocket);

    const messageSocket = await openEventSocket({
      authorization: `Bearer ${readToken}`,
      upgrade: "websocket"
    });
    const pong = nextSocketMessage(messageSocket);
    messageSocket.send("ping");
    await expect(pong).resolves.toBe("pong");
    const messageFrame = nextSocketFrame(messageSocket);
    await env.MAIL_EVENTS.getByName("workspace").publish({
      topic: "messages",
      userIds: [userId]
    });
    await expect(messageFrame).resolves.toEqual({ type: "changed", topic: "messages" });
    const labelFrame = nextSocketFrame(messageSocket);
    await env.MAIL_EVENTS.getByName("workspace").publish({
      topic: "labels",
      userIds: [userId]
    });
    await expect(labelFrame).resolves.toEqual({ type: "changed", topic: "labels" });
    await closeEventSocket(messageSocket);

    const draftSocket = await openEventSocket({
      authorization: `Bearer ${fullToken}`,
      upgrade: "websocket"
    });
    const draftFrame = nextSocketFrame(draftSocket);
    await env.MAIL_EVENTS.getByName("workspace").publish({
      topic: "drafts",
      userIds: [userId]
    });
    await expect(draftFrame).resolves.toEqual({ type: "changed", topic: "drafts" });
    await closeEventSocket(draftSocket);
  });

  it("does not count a closing event socket toward the per-user limit", async () => {
    const headers = {
      authorization: `Bearer ${readToken}`,
      upgrade: "websocket"
    };
    const firstSocket = await openEventSocket(headers);
    const secondSocket = await openEventSocket(headers);
    const thirdSocket = await openEventSocket(headers);
    const clientCloses = [firstSocket, secondSocket, thirdSocket].map(nextSocketClose);
    const stub = env.MAIL_EVENTS.getByName("workspace");

    const state = await runInDurableObject(stub, async (instance, durableState) => {
      const initialSockets = durableState
        .getWebSockets()
        .filter((socket) => socket.readyState === WebSocket.OPEN);
      const closingSocket = initialSockets.at(-1);
      if (!closingSocket) throw new Error("Expected an open event socket.");
      closingSocket.close(1000, "Reconnect test.");
      const closingReadyState = closingSocket.readyState;

      const response = await instance.fetch(
        new Request(`${origin}/api/v2/events`, {
          headers: {
            [mailEventInternalHeaders.requestId]: "request_reconnect_test",
            [mailEventInternalHeaders.topics]: "messages,mailboxes",
            [mailEventInternalHeaders.user]: userId,
            upgrade: "websocket"
          }
        })
      );
      const replacementSocket = response.webSocket;
      if (!replacementSocket) throw new Error("Expected a replacement event socket.");
      replacementSocket.accept();
      const openSocketCount = durableState
        .getWebSockets()
        .filter((socket) => socket.readyState === WebSocket.OPEN).length;

      for (const socket of durableState.getWebSockets()) {
        if (socket.readyState === WebSocket.OPEN) socket.close(1000, "Test complete.");
      }
      return { closingReadyState, openSocketCount, status: response.status };
    });

    expect(state).toEqual({
      closingReadyState: WebSocket.CLOSING,
      openSocketCount: 3,
      status: 101
    });
    await Promise.all(clientCloses);
    await expectOpenEventSocketCount(0);
  });

  it("closes an event socket when its authorization lease expires", async () => {
    const socket = await openEventSocket({
      authorization: `Bearer ${readToken}`,
      upgrade: "websocket"
    });
    const stub = env.MAIL_EVENTS.getByName("workspace");

    // Consume any older scheduled alarm and let the object schedule this live socket's expiry.
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const expiresAt = await runInDurableObject(stub, (_instance, state) =>
      state.storage.getAlarm()
    );
    expect(expiresAt).not.toBeNull();

    const closed = nextSocketClose(socket);
    const now = vi.spyOn(Date, "now").mockReturnValue((expiresAt ?? 0) + 1);
    try {
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      await expect(closed).resolves.toMatchObject({
        code: 1008,
        reason: "Reconnect to renew authentication."
      });
    } finally {
      now.mockRestore();
      socket.close(1000, "Test complete.");
    }
  });

  it("reads mail with an audience-bound bearer token without exposing storage keys", async () => {
    const list = await apiFetch("/api/v2/messages", readToken);
    expect(list.status, await list.clone().text()).toBe(200);
    await expect(list.json()).resolves.toMatchObject([
      { id: "msg_api", fromAddress: "sender@example.net", fromName: "Sender Example" }
    ]);

    const detail = await apiFetch("/api/v2/messages/msg_api", readToken);
    expect(detail.status).toBe(200);
    const payload = (await detail.json()) as {
      attachments: Array<Record<string, unknown>>;
      fromName: string | null;
    };
    expect(payload.fromName).toBe("Sender Example");
    expect(payload.attachments[0]).toMatchObject({ id: "att_api", filename: "hello.txt" });
    expect(payload.attachments[0]).not.toHaveProperty("r2Key");

    const attachment = await apiFetch("/api/v2/attachments/att_api", readToken);
    expect(attachment.status).toBe(200);
    expect(await attachment.text()).toBe("hello");
  });

  it("returns visible content before and after separately classified reply history", async () => {
    const response = await apiFetch("/api/v2/messages/msg_api/html", readToken);
    expect(response.status, await response.clone().text()).toBe(200);
    const payload = (await response.json()) as {
      afterQuotedHtml: string | null;
      html: string;
      quotedHtml: string | null;
      remoteMediaTrusted: boolean;
    };

    expect(payload.html).toContain("Visible before");
    expect(payload.html).not.toContain("Earlier reply");
    expect(payload.quotedHtml).toContain("Earlier reply");
    expect(payload.afterQuotedHtml).toContain("Visible after");
    expect(payload.remoteMediaTrusted).toBe(false);
  });

  it("unarchives and restores mail through the versioned action route", async () => {
    const socket = await openEventSocket({
      authorization: `Bearer ${readToken}`,
      upgrade: "websocket"
    });
    const changed = nextSocketFrame(socket);
    const archived = await apiFetch("/api/v2/messages/msg_api/archive", writeToken, {
      method: "POST"
    });
    expect(archived.status, await archived.clone().text()).toBe(200);
    await expect(archived.json()).resolves.toMatchObject({ folder: "archived" });
    await expect(changed).resolves.toEqual({ type: "changed", topic: "messages" });
    await closeEventSocket(socket);

    const unarchived = await apiFetch("/api/v2/messages/msg_api/unarchive", writeToken, {
      method: "POST"
    });
    expect(unarchived.status, await unarchived.clone().text()).toBe(200);
    await expect(unarchived.json()).resolves.toMatchObject({ folder: "inbox" });
    await expect(
      env.DB.prepare("SELECT archived_at, trashed_at FROM messages WHERE id = 'msg_api'").first()
    ).resolves.toEqual({ archived_at: null, trashed_at: null });

    const trashed = await apiFetch("/api/v2/messages/msg_api/trash", writeToken, {
      method: "POST"
    });
    expect(trashed.status, await trashed.clone().text()).toBe(200);
    await expect(trashed.json()).resolves.toMatchObject({ folder: "trash" });

    const restored = await apiFetch("/api/v2/messages/msg_api/restore", writeToken, {
      method: "POST"
    });
    expect(restored.status, await restored.clone().text()).toBe(200);
    await expect(restored.json()).resolves.toMatchObject({ folder: "inbox" });
    await expect(
      env.DB.prepare("SELECT archived_at, trashed_at FROM messages WHERE id = 'msg_api'").first()
    ).resolves.toEqual({ archived_at: null, trashed_at: null });
  });

  it("keeps a draft attachment's multipart MIME type", async () => {
    const created = await apiFetch("/api/v2/drafts", fullToken, {
      body: JSON.stringify({ mailboxId: "mbx_api", from: "support@example.com" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const draft = (await created.json()) as { id: string };
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "pixel.png", {
        type: "image/png"
      })
    );

    const uploaded = await apiFetch(`/api/v2/drafts/${draft.id}/attachments`, fullToken, {
      body: form,
      method: "POST"
    });
    expect(uploaded.status, await uploaded.clone().text()).toBe(201);
    await expect(uploaded.json()).resolves.toMatchObject({
      contentType: "image/png",
      filename: "pixel.png",
      sizeBytes: 4,
      inline: false
    });

    const stored = await apiFetch(`/api/v2/drafts/${draft.id}`, fullToken);
    await expect(stored.json()).resolves.toMatchObject({
      attachments: [
        { contentType: "image/png", filename: "pixel.png", inline: false, sizeBytes: 4 }
      ]
    });
  });

  it("enforces the draft byte limit across concurrent uploads", async () => {
    const created = await apiFetch("/api/v2/drafts", fullToken, {
      body: JSON.stringify({ mailboxId: "mbx_api", from: "support@example.com" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const draft = (await created.json()) as { id: string };
    const maxBytes = 25 * 1024 * 1024;
    await env.DB.prepare(
      `INSERT INTO draft_attachments
       (id, draft_id, filename, content_type, size_bytes, content_id, r2_key, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
    )
      .bind(
        `seed-${draft.id}`,
        draft.id,
        "seed.bin",
        "application/octet-stream",
        maxBytes - 1,
        `drafts/${userId}/${draft.id}/seed`,
        "2026-08-25T00:00:00.000Z"
      )
      .run();
    const upload = (filename: string) => {
      const form = new FormData();
      form.set("file", new File([new Uint8Array([1])], filename));
      return apiFetch(`/api/v2/drafts/${draft.id}/attachments`, fullToken, {
        body: form,
        method: "POST"
      });
    };

    const responses = await Promise.all([upload("first.bin"), upload("second.bin")]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 413]);
    const totals = await env.DB.prepare(
      "SELECT COUNT(*) AS count, SUM(size_bytes) AS size FROM draft_attachments WHERE draft_id = ?"
    )
      .bind(draft.id)
      .first<{ count: number; size: number }>();
    expect(totals).toEqual({ count: 2, size: maxBytes });
    const removed = await apiFetch(`/api/v2/drafts/${draft.id}`, fullToken, { method: "DELETE" });
    expect(removed.status).toBe(204);
  });

  it("uploads, privately streams, and sends safe inline draft images", async () => {
    const created = await apiFetch("/api/v2/drafts", fullToken, {
      body: JSON.stringify({ mailboxId: "mbx_api", from: "support@example.com" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const draft = (await created.json()) as { id: string };
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const form = new FormData();
    form.set("file", new File([bytes], "inline.png", { type: "image/png" }));
    form.set("inline", "true");

    const uploaded = await apiFetch(`/api/v2/drafts/${draft.id}/attachments`, fullToken, {
      body: form,
      method: "POST"
    });
    expect(uploaded.status, await uploaded.clone().text()).toBe(201);
    const attachment = (await uploaded.json()) as {
      id: string;
      inline: boolean;
      contentId?: string;
    };
    expect(attachment.inline).toBe(true);
    expect(attachment).not.toHaveProperty("contentId");
    const reopened = await apiFetch(`/api/v2/drafts/${draft.id}`, fullToken);
    await expect(reopened.json()).resolves.toMatchObject({
      attachments: [{ id: attachment.id, inline: true }]
    });

    const stored = await env.DB.prepare("SELECT content_id FROM draft_attachments WHERE id = ?")
      .bind(attachment.id)
      .first<{ content_id: string }>();
    expect(stored?.content_id).toBe(`${attachment.id}@hqbase.invalid`);
    await expect(
      draftAttachmentObjects(env.DB, env.MAIL_OBJECTS, userId, [attachment.id])
    ).resolves.toEqual([
      expect.objectContaining({
        contentId: `${attachment.id}@hqbase.invalid`,
        draftId: draft.id,
        id: attachment.id
      })
    ]);

    const inline = await apiFetch(
      `/api/v2/drafts/${draft.id}/attachments/${attachment.id}/inline`,
      fullToken
    );
    expect(inline.status).toBe(200);
    expect(inline.headers.get("cache-control")).toBe("no-store");
    expect(inline.headers.get("content-disposition")).toBe("inline");
    expect(inline.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(inline.headers.get("content-type")).toBe("image/png");
    expect(inline.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await inline.arrayBuffer())).toEqual(bytes);

    const withoutSendAccess = await apiFetch(
      `/api/v2/drafts/${draft.id}/attachments/${attachment.id}/inline`,
      readToken
    );
    expect(withoutSendAccess.status).toBe(403);

    const unusedForm = new FormData();
    unusedForm.set("file", new File([bytes], "unused.png", { type: "image/png" }));
    unusedForm.set("inline", "true");
    const unusedUpload = await apiFetch(`/api/v2/drafts/${draft.id}/attachments`, fullToken, {
      body: unusedForm,
      method: "POST"
    });
    expect(unusedUpload.status, await unusedUpload.clone().text()).toBe(201);
    const unusedAttachment = (await unusedUpload.json()) as { id: string };
    const objectRows = await env.DB.prepare(
      "SELECT id, r2_key FROM draft_attachments WHERE id IN (?, ?) ORDER BY id"
    )
      .bind(attachment.id, unusedAttachment.id)
      .all<{ id: string; r2_key: string }>();
    const objectKeys = new Map(objectRows.results.map((row) => [row.id, row.r2_key]));

    const sentResponse = await apiFetch("/api/v2/send", fullToken, {
      body: JSON.stringify({
        attachmentIds: [attachment.id],
        draftId: draft.id,
        from: "support@example.com",
        html: `<p>Hello<img src="/api/v2/drafts/${draft.id}/attachments/${attachment.id}/inline" width="32" height="32"></p>`,
        subject: "Inline image",
        text: "Hello",
        to: ["person@example.net"]
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(sentResponse.status, await sentResponse.clone().text()).toBe(201);
    const sent = (await sentResponse.json()) as { hasAttachments: boolean; id: string };
    expect(sent.hasAttachments).toBe(false);
    const sentRow = await env.DB.prepare(
      "SELECT has_attachments, html_r2_key FROM messages WHERE id = ?"
    )
      .bind(sent.id)
      .first<{ has_attachments: number; html_r2_key: string }>();
    expect(sentRow?.has_attachments).toBe(0);
    const sentHtml = sentRow?.html_r2_key ? await env.MAIL_OBJECTS.get(sentRow.html_r2_key) : null;
    expect(await sentHtml?.text()).toContain(`src="cid:${attachment.id}@hqbase.invalid"`);
    const sentInline = await env.DB.prepare(
      "SELECT content_id, r2_key FROM message_attachments WHERE message_id = ?"
    )
      .bind(sent.id)
      .first<{ content_id: string; r2_key: string }>();
    expect(sentInline).toMatchObject({
      content_id: `${attachment.id}@hqbase.invalid`,
      r2_key: expect.stringMatching(/^sent\//u)
    });
    expect(await env.MAIL_OBJECTS.get(sentInline?.r2_key ?? "missing")).not.toBeNull();
    expect(await env.MAIL_OBJECTS.get(objectKeys.get(attachment.id) ?? "missing")).toBeNull();
    expect(await env.MAIL_OBJECTS.get(objectKeys.get(unusedAttachment.id) ?? "missing")).toBeNull();
    expect(await apiFetch(`/api/v2/drafts/${draft.id}`, fullToken)).toMatchObject({ status: 404 });
  });

  it("rejects spoofed inline images before storing metadata", async () => {
    const created = await apiFetch("/api/v2/drafts", fullToken, {
      body: JSON.stringify({ mailboxId: "mbx_api", from: "support@example.com" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const draft = (await created.json()) as { id: string };
    const form = new FormData();
    form.set("file", new File(["not an image"], "spoofed.png", { type: "image/png" }));
    form.set("inline", "true");

    const rejected = await apiFetch(`/api/v2/drafts/${draft.id}/attachments`, fullToken, {
      body: form,
      method: "POST"
    });
    expect(rejected.status, await rejected.clone().text()).toBe(415);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: "INLINE_MEDIA_UNSUPPORTED" }
    });
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM draft_attachments WHERE draft_id = ?"
    )
      .bind(draft.id)
      .first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it("forwards an accessible message with its original attachments", async () => {
    const response = await apiFetch("/api/v2/forward", fullToken, {
      body: JSON.stringify({
        messageId: "msg_api",
        from: "support@example.com",
        to: ["person@example.net"],
        text: "Please review.",
        includeOriginalAttachments: true
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(response.status, await response.clone().text()).toBe(201);
    const forwarded = (await response.json()) as { id: string };
    const detail = await apiFetch(`/api/v2/messages/${forwarded.id}`, readToken);
    await expect(detail.json()).resolves.toMatchObject({
      attachments: [{ contentType: "text/plain", filename: "hello.txt", sizeBytes: 5 }],
      folder: "sent",
      hasAttachments: true,
      subject: "Fwd: API message"
    });
  });

  it("sends a web forward draft with its original attachments", async () => {
    const created = await apiFetch("/api/v2/drafts", fullToken, {
      body: JSON.stringify({
        mailboxId: "mbx_api",
        forwardOfMessageId: "msg_api",
        from: "support@example.com",
        to: ["person@example.net"],
        subject: "Fwd: API message",
        text: "---------- Forwarded message ---------\n\nBody",
        html: "<blockquote>Body</blockquote>"
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(created.status, await created.clone().text()).toBe(201);
    const draft = (await created.json()) as { id: string };

    const response = await apiFetch("/api/v2/send", fullToken, {
      body: JSON.stringify({
        from: "support@example.com",
        to: ["person@example.net"],
        subject: "Fwd: API message",
        text: "---------- Forwarded message ---------\n\nBody",
        html: "<blockquote>Body</blockquote>",
        draftId: draft.id
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(response.status, await response.clone().text()).toBe(201);
    const forwarded = (await response.json()) as { id: string };
    const detail = await apiFetch(`/api/v2/messages/${forwarded.id}`, readToken);
    await expect(detail.json()).resolves.toMatchObject({
      attachments: [{ contentType: "text/plain", filename: "hello.txt", sizeBytes: 5 }],
      folder: "sent",
      hasAttachments: true,
      subject: "Fwd: API message"
    });
    const deletedDraft = await apiFetch(`/api/v2/drafts/${draft.id}`, fullToken);
    expect(deletedDraft.status).toBe(404);
  });

  it("limits unassigned mail to authenticated owners", async () => {
    try {
      for (const role of ["member", "admin"] as const) {
        await setUserRole(role);
        const list = await apiFetch("/api/v2/messages?folder=catchall", readToken);
        await expect(list.json()).resolves.toEqual([]);
        await expect(
          apiFetch("/api/v2/messages/msg_api_unassigned", readToken)
        ).resolves.toMatchObject({ status: 403 });
      }

      await setUserRole("owner");
      const list = await apiFetch("/api/v2/messages?folder=catchall", readToken);
      await expect(list.json()).resolves.toMatchObject([{ id: "msg_api_unassigned" }]);
      await expect(
        apiFetch("/api/v2/messages/msg_api_unassigned", readToken)
      ).resolves.toMatchObject({ status: 200 });
      await expect(apiFetch("/api/v2/messages/msg_api_orphan", readToken)).resolves.toMatchObject({
        status: 404
      });
      await expect(apiFetch("/api/v2/messages/missing", readToken)).resolves.toMatchObject({
        status: 404
      });
    } finally {
      await setUserRole("member");
    }
  });

  it("rejects wrong audiences, revoked tokens, and invalid bearer precedence", async () => {
    await expect(apiFetch("/api/v2/messages", wrongAudienceToken)).resolves.toMatchObject({
      status: 401
    });
    await expect(apiFetch("/api/v2/messages", revokedToken)).resolves.toMatchObject({
      status: 401
    });
    const invalidOverCookie = await SELF.fetch(`${origin}/api/v2/messages`, {
      headers: { authorization: "Bearer invalid", cookie }
    });
    expect(invalidOverCookie.status).toBe(401);
  });

  it("returns insufficient_scope before applying write or send actions", async () => {
    const write = await apiFetch("/api/v2/messages/msg_api/read", readToken, { method: "POST" });
    expect(write.status).toBe(403);
    expect(write.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    expect(write.headers.get("www-authenticate")).toContain('scope="mail:write"');

    const send = await apiFetch("/api/v2/drafts", writeToken, {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(send.status).toBe(403);
    expect(send.headers.get("www-authenticate")).toContain('scope="mail:send"');
  });

  it("uses consent scope intersection and permits full-scope draft creation", async () => {
    await env.DB.prepare("UPDATE oauthConsent SET scopes = ? WHERE id = 'consent_api'")
      .bind(JSON.stringify(["mail:read"]))
      .run();
    try {
      const narrowed = await apiFetch("/api/v2/drafts", fullToken);
      expect(narrowed.status).toBe(403);
    } finally {
      await env.DB.prepare("UPDATE oauthConsent SET scopes = ? WHERE id = 'consent_api'")
        .bind(JSON.stringify(scopes))
        .run();
    }

    const created = await apiFetch("/api/v2/drafts", fullToken, {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(created.status, await created.clone().text()).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ version: 1, attachments: [] });
  });

  it("applies live mailbox grants and does not expose administration under v1", async () => {
    const draftResponse = await apiFetch("/api/v2/drafts", fullToken, {
      body: JSON.stringify({ mailboxId: "mbx_api", from: "support@example.com" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(draftResponse.status, await draftResponse.clone().text()).toBe(201);
    const mailboxDraft = (await draftResponse.json()) as { id: string };

    await env.DB.prepare(
      "DELETE FROM mailbox_grants WHERE mailbox_id = 'mbx_api' AND principal_id = ?"
    )
      .bind(userId)
      .run();
    try {
      const hidden = await apiFetch("/api/v2/messages", readToken);
      await expect(hidden.json()).resolves.toEqual([]);
      await expect(apiFetch("/api/v2/messages/msg_api", readToken)).resolves.toMatchObject({
        status: 403
      });
      const drafts = await apiFetch("/api/v2/drafts", fullToken);
      const visibleDrafts = (await drafts.json()) as Array<{ id: string }>;
      expect(visibleDrafts.map(({ id }) => id)).not.toContain(mailboxDraft.id);
      const inaccessibleDraft = await apiFetch(`/api/v2/drafts/${mailboxDraft.id}`, fullToken);
      expect(inaccessibleDraft.status, await inaccessibleDraft.clone().text()).toBe(404);
    } finally {
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at)
         VALUES ('mbx_api', ?, 'agent', ?, ?, ?)`
      )
        .bind(userId, userId, now, now)
        .run();
    }

    const adminRoute = await apiFetch("/api/v2/users", fullToken);
    expect(adminRoute.status).toBe(404);
  });

  it("dynamically registers a public client for the API resource", async () => {
    const metadata = await SELF.fetch(`${origin}/.well-known/oauth-authorization-server/api/auth`);
    const discovery = (await metadata.json()) as { registration_endpoint?: string };
    const response = await SELF.fetch(discovery.registration_endpoint ?? "", {
      body: JSON.stringify({
        client_name: "Mail API test client",
        redirect_uris: ["https://client.example/api-callback"],
        token_endpoint_auth_method: "none",
        scope: scopes.join(" "),
        resources: [apiResource]
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(response.status, await response.clone().text()).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ token_endpoint_auth_method: "none" });
  });

  describe("message pagination", () => {
    // msg_page_2, msg_page_3, and msg_page_4 share one activity timestamp, so the tie is broken
    // by descending id. msg_secret_1 shares that timestamp too but is in an unreadable mailbox.
    const tie = "2025-01-01T00:00:02.000Z";
    const readableOrder = ["msg_page_1", "msg_page_4", "msg_page_3", "msg_page_2", "msg_page_5"];

    beforeAll(async () => {
      const stamp = "2025-01-01T00:00:00.000Z";
      await env.DB.batch([
        mailboxRow("mbx_page", "page@example.com"),
        mailboxRow("mbx_bulk", "bulk@example.com"),
        mailboxRow("mbx_secret", "secret@example.com"),
        grantRow("mbx_page"),
        grantRow("mbx_bulk"),
        threadRow("thr_page"),
        threadRow("thr_bulk"),
        threadRow("thr_secret"),
        messageRow("msg_page_1", "thr_page", "mbx_page", "inbox", "2025-01-01T00:00:03.000Z", {
          subject: "Quarterly report"
        }),
        messageRow("msg_page_2", "thr_page", "mbx_page", "inbox", tie, {
          subject: "Quarterly report"
        }),
        messageRow("msg_page_3", "thr_page", "mbx_page", "inbox", tie),
        messageRow("msg_page_4", "thr_page", "mbx_page", "inbox", tie),
        messageRow("msg_page_5", "thr_page", "mbx_page", "archived", "2025-01-01T00:00:01.000Z", {
          subject: "Quarterly report"
        }),
        messageRow("msg_secret_1", "thr_secret", "mbx_secret", "inbox", tie),
        messageRow("msg_secret_2", "thr_secret", "mbx_secret", "inbox", stamp),
        ...Array.from({ length: 120 }, (_, index) =>
          messageRow(
            `msg_bulk_${String(index).padStart(3, "0")}`,
            "thr_bulk",
            "mbx_bulk",
            "inbox",
            `2024-01-01T00:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(
              index % 60
            ).padStart(2, "0")}.000Z`
          )
        )
      ]);
    });

    it("keeps activity and id order across a page boundary that splits equal timestamps", async () => {
      const { ids, pages } = await walkPages("/api/v2/messages?mailboxId=mbx_page&limit=2");

      expect(ids).toEqual(readableOrder);
      expect(new Set(ids).size).toBe(ids.length);
      expect(pages).toEqual([
        ["msg_page_1", "msg_page_4"],
        ["msg_page_3", "msg_page_2"],
        ["msg_page_5"]
      ]);
    });

    it("omits the Link header on the final page", async () => {
      const single = await apiFetch("/api/v2/messages?mailboxId=mbx_page&limit=100", readToken);
      expect(single.status).toBe(200);
      await expect(single.json()).resolves.toHaveLength(readableOrder.length);
      expect(single.headers.get("link")).toBeNull();

      const firstOfTwo = await apiFetch("/api/v2/messages?mailboxId=mbx_page&limit=4", readToken);
      expect(firstOfTwo.headers.get("link")).toMatch(/; rel="next"$/u);
    });

    it("preserves mailboxId, folder, search, and limit in the next page link", async () => {
      const response = await apiFetch(
        "/api/v2/messages?mailboxId=mbx_page&folder=inbox&search=report&limit=1",
        readToken
      );
      expect(response.status, await response.clone().text()).toBe(200);
      const next = nextPageUrl(response);
      if (!next) throw new Error("Expected a next page link.");

      const url = new URL(next);
      expect(url.origin + url.pathname).toBe(`${origin}/api/v2/messages`);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        mailboxId: "mbx_page",
        folder: "inbox",
        search: "report",
        limit: "1",
        cursor: expect.any(String)
      });

      // The filters keep working on the next page: msg_page_5 also matches "report" but is
      // archived, so folder=inbox keeps it out.
      const second = await apiFetch(next.slice(origin.length), readToken);
      await expect(second.json()).resolves.toMatchObject([{ id: "msg_page_2" }]);
      expect(second.headers.get("link")).toBeNull();
    });

    it("never lists an unreadable mailbox on any page", async () => {
      const { ids } = await walkPages("/api/v2/messages?limit=50");

      expect(ids).not.toContain("msg_secret_1");
      expect(ids).not.toContain("msg_secret_2");
      expect(ids).toContain("msg_page_1");
    });

    it("does not leak an unreadable mailbox through a cursor that points into it", async () => {
      // A well-formed message cursor positioned at msg_secret_1 inside the tied timestamp.
      const cursor = encodeMessageCursor(tie, "msg_secret_1");
      const response = await apiFetch(`/api/v2/messages?limit=100&cursor=${cursor}`, readToken);
      expect(response.status, await response.clone().text()).toBe(200);
      const ids = ((await response.json()) as Array<{ id: string }>).map((row) => row.id);

      expect(ids).not.toContain("msg_secret_1");
      expect(ids).not.toContain("msg_secret_2");
      expect(ids.slice(0, 4)).toEqual(["msg_page_4", "msg_page_3", "msg_page_2", "msg_page_5"]);
    });

    it("defaults the page to 100 messages and caps the page at 100", async () => {
      const byDefault = await apiFetch("/api/v2/messages?mailboxId=mbx_bulk", readToken);
      expect(byDefault.status).toBe(200);
      await expect(byDefault.json()).resolves.toHaveLength(100);
      expect(byDefault.headers.get("link")).toContain('rel="next"');

      const atCap = await apiFetch("/api/v2/messages?mailboxId=mbx_bulk&limit=100", readToken);
      await expect(atCap.json()).resolves.toHaveLength(100);
    });

    it("rejects an out-of-range or non-integer limit", async () => {
      for (const limit of ["0", "101", "abc", "-1", "1.5", ""]) {
        const response = await apiFetch(`/api/v2/messages?limit=${limit}`, readToken);
        expect(response.status, `limit=${limit}`).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
          error: { code: "INVALID_LIMIT", message: expect.any(String) }
        });
      }
    });

    it("rejects a malformed cursor and a cursor from another list", async () => {
      // A conversation cursor carries version 1, so it must not decode as a message cursor.
      const conversationCursor = btoa(JSON.stringify([1, tie, "msg_page_4"]))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/u, "");

      for (const cursor of ["not-a-cursor", "!!!", conversationCursor]) {
        const response = await apiFetch(
          `/api/v2/messages?cursor=${encodeURIComponent(cursor)}`,
          readToken
        );
        expect(response.status, `cursor=${cursor}`).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
          error: { code: "INVALID_CURSOR", message: expect.any(String) }
        });
      }
    });

    async function walkPages(
      path: string
    ): Promise<{ ids: string[]; pages: string[][]; requests: number }> {
      const pages: string[][] = [];
      let next: string | null = `${origin}${path}`;
      let requests = 0;

      while (next) {
        if (++requests > 200) throw new Error("Pagination did not terminate.");
        const response: Response = await apiFetch(next.slice(origin.length), readToken);
        expect(response.status, await response.clone().text()).toBe(200);
        pages.push(((await response.json()) as Array<{ id: string }>).map((row) => row.id));
        next = nextPageUrl(response);
      }

      return { ids: pages.flat(), pages, requests };
    }
  });
});

function nextPageUrl(response: Response): string | null {
  const link = response.headers.get("link");
  if (!link) return null;
  const match = link.match(/^<([^>]+)>;\s*rel="next"$/u);
  if (!match?.[1]) throw new Error(`Malformed Link header: ${link}`);
  return match[1];
}

/** Mirrors the worker's message cursor encoding so tests can aim a cursor at a chosen row. */
function encodeMessageCursor(activityAt: string, id: string): string {
  return btoa(JSON.stringify(["m1", activityAt, id]))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function mailboxRow(id: string, address: string): D1PreparedStatement {
  const stamp = "2025-01-01T00:00:00.000Z";
  return env.DB.prepare(
    `INSERT INTO mailboxes
     (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
     VALUES (?, ?, 'dom_api', ?, 1, ?, ?)`
  ).bind(id, address, id, stamp, stamp);
}

function grantRow(mailboxId: string): D1PreparedStatement {
  const stamp = "2025-01-01T00:00:00.000Z";
  return env.DB.prepare(
    `INSERT INTO mailbox_grants (mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at)
     VALUES (?, ?, 'agent', ?, ?, ?)`
  ).bind(mailboxId, userId, userId, stamp, stamp);
}

function threadRow(id: string): D1PreparedStatement {
  const stamp = "2025-01-01T00:00:00.000Z";
  return env.DB.prepare(
    `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, id, stamp, stamp, stamp);
}

function messageRow(
  id: string,
  threadId: string,
  mailboxId: string,
  folder: string,
  receivedAt: string,
  options: { subject?: string } = {}
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO messages
     (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
      subject, snippet, text_body, message_id, dedupe_key, in_reply_to, references_json,
      received_at, sent_at, read_at, has_attachments, created_at, updated_at)
     VALUES (?, ?, ?, 'inbound', ?, 'sender@example.net', '[]', '[]', '[]', ?, '', '',
             ?, ?, NULL, '[]', ?, NULL, NULL, 0, ?, ?)`
  ).bind(
    id,
    threadId,
    mailboxId,
    folder,
    options.subject ?? id,
    `<${id}@example.net>`,
    `dedupe-${id}`,
    receivedAt,
    receivedAt,
    receivedAt
  );
}

function apiFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  return SELF.fetch(`${origin}${path}`, { ...init, headers });
}

async function setUserRole(role: "admin" | "member" | "owner"): Promise<void> {
  await env.DB.prepare(`UPDATE "user" SET role = ? WHERE id = ?`).bind(role, userId).run();
}

function extractSessionCookie(response: Response): string {
  const serialized = response.headers.get("set-cookie") ?? "";
  const match = serialized.match(/(?:^|,\s*)((?:__Secure-)?better-auth\.session_token=[^;,]+)/);
  if (!match?.[1]) throw new Error("Session cookie was not returned.");
  return match[1];
}

async function openEventSocket(headers: HeadersInit, path = "/api/v2/events"): Promise<WebSocket> {
  const response = await SELF.fetch(`${origin}${path}`, { headers });
  if (response.status !== 101) {
    throw new Error(`WebSocket upgrade failed (${response.status}): ${await response.text()}`);
  }
  if (!response.webSocket) throw new Error("WebSocket upgrade did not return a socket.");
  response.webSocket.accept();
  return response.webSocket;
}

function nextSocketFrame(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket.addEventListener(
      "message",
      (event) => {
        try {
          resolve(JSON.parse(String(event.data)));
        } catch (error) {
          reject(error);
        }
      },
      { once: true }
    );
  });
}

function nextSocketMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true });
  });
}

function nextSocketClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.addEventListener(
      "close",
      (event) => resolve({ code: event.code, reason: event.reason }),
      { once: true }
    );
  });
}

async function closeEventSocket(socket: WebSocket): Promise<void> {
  const closed = nextSocketClose(socket);
  const stub = env.MAIL_EVENTS.getByName("workspace");
  await runInDurableObject(stub, (_instance, state) => {
    const openSockets = state
      .getWebSockets()
      .filter((serverSocket) => serverSocket.readyState === WebSocket.OPEN);
    if (openSockets.length !== 1) {
      throw new Error(`Expected one open event socket, found ${openSockets.length}.`);
    }
    openSockets[0]?.close(1000, "Test complete.");
  });
  await closed;
}

async function expectOpenEventSocketCount(expected: number): Promise<void> {
  const stub = env.MAIL_EVENTS.getByName("workspace");
  const count = await runInDurableObject(
    stub,
    (_instance, state) =>
      state.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN).length
  );
  expect(count).toBe(expected);
}
