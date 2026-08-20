import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import mailApiOpenApi from "../../../api/hqbase-mail-api-v1.openapi.json";
import { createAuth } from "../../../worker/auth/auth";
import { applyCurrentMigrations } from "./current-migrations";
import { tokenRow } from "./mail-api-token-fixture";

const origin = "https://hqbase.test";
const apiResource = `${origin}/api/v1`;
const readToken = "hqb_access_mail-api-read-token";
const writeToken = "hqb_access_mail-api-write-token";
const fullToken = "hqb_access_mail-api-full-token";
const wrongAudienceToken = "hqb_access_mail-api-wrong-audience-token";
const revokedToken = "hqb_access_mail-api-revoked-token";
const scopes = ["mail:read", "mail:write", "mail:send"];
let cookie = "";
let userId = "";

describe("HQBase Mail API v1", () => {
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
        `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_api', 'support@example.com', 'Support', 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
         VALUES ('dom_api', 'example.com', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mailbox_addresses
         (id, mailbox_id, mail_domain_id, local_part, address, display_name,
          receive_enabled, send_enabled, is_primary, created_at, updated_at)
         VALUES ('addr_api', 'mbx_api', 'dom_api', 'support', 'support@example.com', 'Support',
                 1, 1, 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
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
         (id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
          subject, snippet, text_body, message_id, dedupe_key, in_reply_to, references_json,
          received_at, sent_at, read_at, has_attachments, created_at, updated_at)
         VALUES ('msg_api', 'thr_api', 'mbx_api', 'inbound', 'inbox', 'sender@example.net', ?,
                 '[]', '[]', 'API message', 'Body', 'Body', '<api@example.net>', 'api-dedupe',
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
  });

  it("publishes protected-resource metadata and a scoped authentication challenge", async () => {
    const metadata = await SELF.fetch(`${origin}/.well-known/oauth-protected-resource/api/v1`);
    expect(metadata.status).toBe(200);
    await expect(metadata.json()).resolves.toMatchObject({
      resource: apiResource,
      authorization_servers: [`${origin}/api/auth`],
      scopes_supported: scopes,
      resource_name: "HQBase Mail API",
      resource_documentation: `${origin}/skills/hqbase-mail/SKILL.md`
    });

    const rejected = await SELF.fetch(`${origin}/api/v1/messages`);
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("www-authenticate")).toContain(
      `resource_metadata="${origin}/.well-known/oauth-protected-resource/api/v1"`
    );
    expect(rejected.headers.get("www-authenticate")).toContain('scope="mail:read"');
    expect(rejected.headers.get("x-request-id")).toBeTruthy();
  });

  it("publishes an instance-adjusted Agent Skill and OpenAPI discovery", async () => {
    const skill = await SELF.fetch(`${origin}/skills/hqbase-mail/SKILL.md`);
    expect(skill.status).toBe(200);
    expect(skill.headers.get("content-type")).toContain("text/markdown");
    expect(skill.headers.get("access-control-allow-origin")).toBe("*");
    const instructions = await skill.text();
    expect(instructions).toMatch(
      /^---\nname: hqbase-mail\ndescription: [^\n]+\n---\n\n# HQBase Mail/
    );
    expect(instructions).toContain(`- Instance origin: ${origin}`);
    expect(instructions).toContain(`- API base URL: ${apiResource}`);
    expect(instructions).toContain(`- OpenAPI contract: ${origin}/api/v1/openapi.json`);
    expect(instructions).toContain(`resource=${apiResource}`);
    expect(instructions).toContain("urn:ietf:params:oauth:grant-type:device_code");
    expect(instructions).toContain("verification_uri_complete");
    expect(instructions).toContain("authorization_pending");
    expect(instructions).toContain("Prefer Device Authorization");
    expect(instructions).toContain(
      "Do not open, navigate to, or interact with the verification URL in Cloud Browser"
    );
    expect(instructions).toContain("The person must open it themselves in a browser they control");
    expect(instructions).toContain("Sending, replying, and forwarding are not idempotent");
    expect(instructions).toContain(
      "get a checkpoint from `GET https://hqbase.test/api/v1/changes`"
    );
    expect(instructions).toContain("List mailboxes before each change cycle");
    expect(instructions).toContain("`application_type` set to `native`");
    expect(instructions).toContain("RFC 8252");
    expect(instructions).toContain("app-claimed HTTPS, loopback HTTP, and private-use schemes");
    expect(instructions).toContain("INVALID_PERSONAL_ACCESS_TOKEN");
    expect(instructions).toContain("Bearer token is invalid or inactive.");
    expect(instructions).toContain("start with `hqb_pat_`");
    expect(instructions).toContain("does not fall back to a browser session cookie");
    expect(instructions).toContain("trusted automation");
    expect(instructions).toContain("valid only at the issuing origin");
    expect(instructions).toContain("does not authenticate administration or MCP");
    expect(instructions).toContain("Do not retry the same rejected PAT");
    for (const [path, pathItem] of Object.entries(mailApiOpenApi.paths)) {
      for (const method of ["get", "post", "patch", "delete"] as const) {
        if (method in pathItem) {
          expect(instructions).toContain(`\`${method.toUpperCase()} ${path}\``);
        }
      }
    }

    const openApi = await SELF.fetch(`${origin}/api/v1/openapi.json`);
    expect(openApi.status).toBe(200);
    expect(openApi.headers.get("content-type")).toContain("application/json");
    const document = (await openApi.json()) as {
      components: {
        responses: { MailApiUnauthorized: { description: string } };
        securitySchemes: { personalAccessToken: Record<string, unknown> };
      };
      externalDocs: { url: string };
      paths: Record<
        string,
        Record<string, { responses: Record<string, unknown>; security: unknown }>
      >;
      servers: Array<{ url: string }>;
    };
    expect(document.servers).toEqual([{ url: origin, description: "This HQBase installation" }]);
    expect(document.externalDocs.url).toBe(`${origin}/skills/hqbase-mail/SKILL.md`);
    expect(document.components.securitySchemes.personalAccessToken).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "HQBase PAT"
    });
    expect(document.paths["/api/v1/send"]?.post?.security).toEqual([
      { oauth2: ["mail:send"] },
      { cookieSession: [] },
      { personalAccessToken: [] }
    ]);
    expect(document.paths["/api/v1/send"]?.post?.responses["401"]).toEqual({
      $ref: "#/components/responses/MailApiUnauthorized"
    });
    expect(document.components.responses.MailApiUnauthorized.description).toContain(
      "INVALID_PERSONAL_ACCESS_TOKEN"
    );

    const head = await SELF.fetch(`${origin}/skills/hqbase-mail/SKILL.md`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");

    const rejectedMethod = await SELF.fetch(`${origin}/skills/hqbase-mail/SKILL.md`, {
      method: "POST"
    });
    expect(rejectedMethod.status).toBe(405);
    expect(rejectedMethod.headers.get("allow")).toBe("GET, HEAD");

    for (const legacyPath of ["/AGENTS.md", "/agents.md"]) {
      const redirect = await SELF.fetch(`${origin}${legacyPath}`, { redirect: "manual" });
      expect(redirect.status).toBe(308);
      expect(redirect.headers.get("location")).toBe(`${origin}/skills/hqbase-mail/SKILL.md`);
    }
  });

  it("accepts the web session on v1 while legacy mail routes remain cookie-only", async () => {
    const versioned = await SELF.fetch(`${origin}/api/v1/mailboxes`, { headers: { cookie } });
    expect(versioned.status, await versioned.clone().text()).toBe(200);
    await expect(versioned.json()).resolves.toMatchObject([
      { id: "mbx_api", accessLevel: "agent" }
    ]);

    const legacyCookie = await SELF.fetch(`${origin}/api/messages`, { headers: { cookie } });
    expect(legacyCookie.status).toBe(200);
    const legacyBearer = await apiFetch("/api/messages", readToken);
    expect(legacyBearer.status).toBe(401);
  });

  it("reads mail with an audience-bound bearer token without exposing storage keys", async () => {
    const list = await apiFetch("/api/v1/messages", readToken);
    expect(list.status, await list.clone().text()).toBe(200);
    await expect(list.json()).resolves.toMatchObject([{ id: "msg_api" }]);

    const detail = await apiFetch("/api/v1/messages/msg_api", readToken);
    expect(detail.status).toBe(200);
    const payload = (await detail.json()) as { attachments: Array<Record<string, unknown>> };
    expect(payload.attachments[0]).toMatchObject({ id: "att_api", filename: "hello.txt" });
    expect(payload.attachments[0]).not.toHaveProperty("r2Key");

    const attachment = await apiFetch("/api/v1/attachments/att_api", readToken);
    expect(attachment.status).toBe(200);
    expect(await attachment.text()).toBe("hello");
  });

  it("unarchives and restores mail through the versioned action route", async () => {
    const archived = await apiFetch("/api/v1/messages/msg_api/archive", writeToken, {
      method: "POST"
    });
    expect(archived.status, await archived.clone().text()).toBe(200);
    await expect(archived.json()).resolves.toMatchObject({ folder: "archived" });

    const unarchived = await apiFetch("/api/v1/messages/msg_api/unarchive", writeToken, {
      method: "POST"
    });
    expect(unarchived.status, await unarchived.clone().text()).toBe(200);
    await expect(unarchived.json()).resolves.toMatchObject({ folder: "inbox" });
    await expect(
      env.DB.prepare("SELECT archived_at, trashed_at FROM messages WHERE id = 'msg_api'").first()
    ).resolves.toEqual({ archived_at: null, trashed_at: null });

    const trashed = await apiFetch("/api/v1/messages/msg_api/trash", writeToken, {
      method: "POST"
    });
    expect(trashed.status, await trashed.clone().text()).toBe(200);
    await expect(trashed.json()).resolves.toMatchObject({ folder: "trash" });

    const restored = await apiFetch("/api/v1/messages/msg_api/restore", writeToken, {
      method: "POST"
    });
    expect(restored.status, await restored.clone().text()).toBe(200);
    await expect(restored.json()).resolves.toMatchObject({ folder: "inbox" });
    await expect(
      env.DB.prepare("SELECT archived_at, trashed_at FROM messages WHERE id = 'msg_api'").first()
    ).resolves.toEqual({ archived_at: null, trashed_at: null });
  });

  it("keeps a draft attachment's multipart MIME type", async () => {
    const created = await apiFetch("/api/v1/drafts", fullToken, {
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

    const uploaded = await apiFetch(`/api/v1/drafts/${draft.id}/attachments`, fullToken, {
      body: form,
      method: "POST"
    });
    expect(uploaded.status, await uploaded.clone().text()).toBe(201);
    await expect(uploaded.json()).resolves.toMatchObject({
      contentType: "image/png",
      filename: "pixel.png",
      sizeBytes: 4
    });

    const stored = await apiFetch(`/api/v1/drafts/${draft.id}`, fullToken);
    await expect(stored.json()).resolves.toMatchObject({
      attachments: [{ contentType: "image/png", filename: "pixel.png", sizeBytes: 4 }]
    });
  });

  it("forwards an accessible message with its original attachments", async () => {
    const response = await apiFetch("/api/v1/forward", fullToken, {
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
    const detail = await apiFetch(`/api/v1/messages/${forwarded.id}`, readToken);
    await expect(detail.json()).resolves.toMatchObject({
      attachments: [{ contentType: "text/plain", filename: "hello.txt", sizeBytes: 5 }],
      folder: "sent",
      hasAttachments: true,
      subject: "Fwd: API message"
    });
  });

  it("limits unassigned mail to authenticated owners", async () => {
    try {
      for (const role of ["member", "admin"] as const) {
        await setUserRole(role);
        const list = await apiFetch("/api/v1/messages?folder=catchall", readToken);
        await expect(list.json()).resolves.toEqual([]);
        await expect(
          apiFetch("/api/v1/messages/msg_api_unassigned", readToken)
        ).resolves.toMatchObject({ status: 403 });
      }

      await setUserRole("owner");
      const list = await apiFetch("/api/v1/messages?folder=catchall", readToken);
      await expect(list.json()).resolves.toMatchObject([{ id: "msg_api_unassigned" }]);
      await expect(
        apiFetch("/api/v1/messages/msg_api_unassigned", readToken)
      ).resolves.toMatchObject({ status: 200 });
      await expect(apiFetch("/api/v1/messages/msg_api_orphan", readToken)).resolves.toMatchObject({
        status: 404
      });
      await expect(apiFetch("/api/v1/messages/missing", readToken)).resolves.toMatchObject({
        status: 404
      });
    } finally {
      await setUserRole("member");
    }
  });

  it("rejects wrong audiences, revoked tokens, and invalid bearer precedence", async () => {
    await expect(apiFetch("/api/v1/messages", wrongAudienceToken)).resolves.toMatchObject({
      status: 401
    });
    await expect(apiFetch("/api/v1/messages", revokedToken)).resolves.toMatchObject({
      status: 401
    });
    const invalidOverCookie = await SELF.fetch(`${origin}/api/v1/messages`, {
      headers: { authorization: "Bearer invalid", cookie }
    });
    expect(invalidOverCookie.status).toBe(401);
  });

  it("returns insufficient_scope before applying write or send actions", async () => {
    const write = await apiFetch("/api/v1/messages/msg_api/read", readToken, { method: "POST" });
    expect(write.status).toBe(403);
    expect(write.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    expect(write.headers.get("www-authenticate")).toContain('scope="mail:write"');

    const send = await apiFetch("/api/v1/drafts", writeToken, {
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
      const narrowed = await apiFetch("/api/v1/drafts", fullToken);
      expect(narrowed.status).toBe(403);
    } finally {
      await env.DB.prepare("UPDATE oauthConsent SET scopes = ? WHERE id = 'consent_api'")
        .bind(JSON.stringify(scopes))
        .run();
    }

    const created = await apiFetch("/api/v1/drafts", fullToken, {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(created.status, await created.clone().text()).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ version: 1, attachments: [] });
  });

  it("applies live mailbox grants and does not expose administration under v1", async () => {
    const draftResponse = await apiFetch("/api/v1/drafts", fullToken, {
      body: JSON.stringify({ mailboxId: "mbx_api", from: "support@example.com" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(draftResponse.status, await draftResponse.clone().text()).toBe(201);
    const mailboxDraft = (await draftResponse.json()) as { id: string };

    await env.DB.prepare("DELETE FROM mailbox_grants WHERE mailbox_id = 'mbx_api' AND user_id = ?")
      .bind(userId)
      .run();
    try {
      const hidden = await apiFetch("/api/v1/messages", readToken);
      await expect(hidden.json()).resolves.toEqual([]);
      await expect(apiFetch("/api/v1/messages/msg_api", readToken)).resolves.toMatchObject({
        status: 403
      });
      const drafts = await apiFetch("/api/v1/drafts", fullToken);
      const visibleDrafts = (await drafts.json()) as Array<{ id: string }>;
      expect(visibleDrafts.map(({ id }) => id)).not.toContain(mailboxDraft.id);
      const inaccessibleDraft = await apiFetch(`/api/v1/drafts/${mailboxDraft.id}`, fullToken);
      expect(inaccessibleDraft.status, await inaccessibleDraft.clone().text()).toBe(404);
    } finally {
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
         VALUES ('mbx_api', ?, 'agent', ?, ?, ?)`
      )
        .bind(userId, userId, now, now)
        .run();
    }

    const adminRoute = await apiFetch("/api/v1/users", fullToken);
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
      const { ids, pages } = await walkPages("/api/v1/messages?mailboxId=mbx_page&limit=2");

      expect(ids).toEqual(readableOrder);
      expect(new Set(ids).size).toBe(ids.length);
      expect(pages).toEqual([
        ["msg_page_1", "msg_page_4"],
        ["msg_page_3", "msg_page_2"],
        ["msg_page_5"]
      ]);
    });

    it("omits the Link header on the final page", async () => {
      const single = await apiFetch("/api/v1/messages?mailboxId=mbx_page&limit=100", readToken);
      expect(single.status).toBe(200);
      await expect(single.json()).resolves.toHaveLength(readableOrder.length);
      expect(single.headers.get("link")).toBeNull();

      const firstOfTwo = await apiFetch("/api/v1/messages?mailboxId=mbx_page&limit=4", readToken);
      expect(firstOfTwo.headers.get("link")).toMatch(/; rel="next"$/u);
    });

    it("preserves mailboxId, folder, search, and limit in the next page link", async () => {
      const response = await apiFetch(
        "/api/v1/messages?mailboxId=mbx_page&folder=inbox&search=report&limit=1",
        readToken
      );
      expect(response.status, await response.clone().text()).toBe(200);
      const next = nextPageUrl(response);
      if (!next) throw new Error("Expected a next page link.");

      const url = new URL(next);
      expect(url.origin + url.pathname).toBe(`${origin}/api/v1/messages`);
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
      const { ids } = await walkPages("/api/v1/messages?limit=50");

      expect(ids).not.toContain("msg_secret_1");
      expect(ids).not.toContain("msg_secret_2");
      expect(ids).toContain("msg_page_1");
    });

    it("does not leak an unreadable mailbox through a cursor that points into it", async () => {
      // A well-formed message cursor positioned at msg_secret_1 inside the tied timestamp.
      const cursor = encodeMessageCursor(tie, "msg_secret_1");
      const response = await apiFetch(`/api/v1/messages?limit=100&cursor=${cursor}`, readToken);
      expect(response.status, await response.clone().text()).toBe(200);
      const ids = ((await response.json()) as Array<{ id: string }>).map((row) => row.id);

      expect(ids).not.toContain("msg_secret_1");
      expect(ids).not.toContain("msg_secret_2");
      expect(ids.slice(0, 4)).toEqual(["msg_page_4", "msg_page_3", "msg_page_2", "msg_page_5"]);
    });

    it("defaults the page to 100 messages and caps the page at 100", async () => {
      const byDefault = await apiFetch("/api/v1/messages?mailboxId=mbx_bulk", readToken);
      expect(byDefault.status).toBe(200);
      await expect(byDefault.json()).resolves.toHaveLength(100);
      expect(byDefault.headers.get("link")).toContain('rel="next"');

      const atCap = await apiFetch("/api/v1/messages?mailboxId=mbx_bulk&limit=100", readToken);
      await expect(atCap.json()).resolves.toHaveLength(100);
    });

    it("rejects an out-of-range or non-integer limit", async () => {
      for (const limit of ["0", "101", "abc", "-1", "1.5", ""]) {
        const response = await apiFetch(`/api/v1/messages?limit=${limit}`, readToken);
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
          `/api/v1/messages?cursor=${encodeURIComponent(cursor)}`,
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
    `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).bind(id, address, id, stamp, stamp);
}

function grantRow(mailboxId: string): D1PreparedStatement {
  const stamp = "2025-01-01T00:00:00.000Z";
  return env.DB.prepare(
    `INSERT INTO mailbox_grants (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
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
