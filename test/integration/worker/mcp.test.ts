import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import workspaceMigration from "../../../migrations/0002_workspace.sql?raw";
import oauthResourcesMigration from "../../../migrations/0003_oauth_resources.sql?raw";
import conversationMigration from "../../../migrations/0004_conversations.sql?raw";
import threadRebuildMigration from "../../../migrations/0005_rebuild_threads.sql?raw";
import userOnboardingMigration from "../../../migrations/0008_user_onboarding.sql?raw";
import loginEmailDomainMigration from "../../../migrations/0009_login_email_domain_isolation.sql?raw";
import { hashOAuthToken } from "../../../worker/auth/oauth-token";
import { migrationStatements } from "./migration-statements";

const origin = "https://hqbase.test";
const userId = "usr_mcp_member";
const sessionId = "ses_mcp_member";
const readToken = "hqb_access_mcp-hqbase-read-token";
const readProfileFullToken = "hqb_access_mcp-hqbase-read-profile-full-token";
const fullToken = "hqb_access_mcp-hqbase-full-token";
const fullScopes = ["mail:read", "mail:write", "mail:send"];
const readToolNames = [
  "list_mailboxes",
  "search_messages",
  "list_conversations",
  "get_message",
  "get_thread",
  "get_attachment"
];

describe("HQBase MCP server", () => {
  beforeAll(async () => {
    for (const migration of [
      initialMigration,
      workspaceMigration,
      oauthResourcesMigration,
      conversationMigration,
      threadRebuildMigration,
      userOnboardingMigration,
      loginEmailDomainMigration
    ]) {
      await applyMigration(migration);
    }
    const now = new Date();
    const storedReadToken = await hashOAuthToken("mcp-hqbase-read-token");
    const storedReadProfileFullToken = await hashOAuthToken("mcp-hqbase-read-profile-full-token");
    const storedFullToken = await hashOAuthToken("mcp-hqbase-full-token");
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO "user"
         (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
         VALUES (?, ?, ?, 1, ?, ?, 'member', 0)`
      ).bind(
        userId,
        "MCP Member",
        "mcp-member@login.example",
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO "session"
         (id, expiresAt, token, createdAt, updatedAt, userId)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        sessionId,
        new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        "session-token-mcp-hqbase",
        now.toISOString(),
        now.toISOString(),
        userId
      ),
      env.DB.prepare(
        `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_allowed', 'allowed@example.com', 'Allowed', 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_hidden', 'hidden@example.com', 'Hidden', 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mail_domains (
          id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at
        ) VALUES ('dom_example', 'example.com', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mailbox_addresses (
          id, mailbox_id, mail_domain_id, local_part, address, display_name,
          receive_enabled, send_enabled, is_primary, created_at, updated_at
        ) VALUES (
          'addr_allowed', 'mbx_allowed', 'dom_example', 'allowed', 'allowed@example.com', 'Allowed',
          1, 1, 1, ?, ?
        )`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, user_id, access_level, created_by, created_at, updated_at)
         VALUES ('mbx_allowed', ?, 'agent', ?, ?, ?)`
      ).bind(userId, userId, now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO oauthClient
         (id, clientId, disabled, redirectUris, public, requirePKCE, createdAt, updatedAt)
         VALUES ('oc_mcp_hqbase', 'client_mcp_hqbase', 0, ?, 1, 1, ?, ?)`
      ).bind(
        JSON.stringify(["https://client.example/callback"]),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO oauthConsent
         (id, clientId, userId, scopes, resources, createdAt, updatedAt)
         VALUES ('consent_mcp_hqbase', 'client_mcp_hqbase', ?, ?, ?, ?, ?)`
      ).bind(
        userId,
        JSON.stringify(fullScopes),
        JSON.stringify([`${origin}/mcp`]),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO oauthAccessToken
         (id, token, clientId, sessionId, userId, expiresAt, createdAt, scopes, resources)
         VALUES ('access_mcp_hqbase', ?, 'client_mcp_hqbase', ?, ?, ?, ?, ?, ?)`
      ).bind(
        storedReadToken,
        sessionId,
        userId,
        new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        now.toISOString(),
        JSON.stringify(["mail:read"]),
        JSON.stringify([`${origin}/mcp`])
      ),
      env.DB.prepare(
        `INSERT INTO oauthAccessToken
         (id, token, clientId, sessionId, userId, expiresAt, createdAt, scopes, resources)
         VALUES ('access_mcp_hqbase_read_profile_full', ?, 'client_mcp_hqbase', ?, ?, ?, ?, ?, ?)`
      ).bind(
        storedReadProfileFullToken,
        sessionId,
        userId,
        new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        now.toISOString(),
        JSON.stringify(fullScopes),
        JSON.stringify([`${origin}/mcp`])
      ),
      env.DB.prepare(
        `INSERT INTO oauthClient
         (id, clientId, disabled, redirectUris, public, requirePKCE, createdAt, updatedAt)
         VALUES ('oc_mcp_hqbase_full', 'client_mcp_hqbase_full', 0, ?, 1, 1, ?, ?)`
      ).bind(
        JSON.stringify(["https://client.example/full-callback"]),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO oauthConsent
         (id, clientId, userId, scopes, resources, createdAt, updatedAt)
         VALUES ('consent_mcp_hqbase_full', 'client_mcp_hqbase_full', ?, ?, ?, ?, ?)`
      ).bind(
        userId,
        JSON.stringify(fullScopes),
        JSON.stringify([`${origin}/mcp/full`]),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO oauthAccessToken
         (id, token, clientId, sessionId, userId, expiresAt, createdAt, scopes, resources)
         VALUES ('access_mcp_hqbase_full', ?, 'client_mcp_hqbase_full', ?, ?, ?, ?, ?, ?)`
      ).bind(
        storedFullToken,
        sessionId,
        userId,
        new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        now.toISOString(),
        JSON.stringify(fullScopes),
        JSON.stringify([`${origin}/mcp/full`])
      ),
      env.DB.prepare(
        `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
         VALUES ('thr_mcp_allowed', 'mcp allowed', ?, ?, ?)`
      ).bind(now.toISOString(), now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO messages (
          id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
          subject, snippet, text_body, message_id, dedupe_key, in_reply_to, references_json,
          received_at, sent_at, read_at, has_attachments, created_at, updated_at
        ) VALUES (
          'msg_mcp_allowed', 'thr_mcp_allowed', 'mbx_allowed', 'inbound', 'inbox',
          'sender@example.com', ?, '[]', '[]', 'MCP allowed', 'Attachment body',
          'Attachment body', '<mcp-allowed@example.com>', 'mcp-allowed:allowed@example.com',
          NULL, '[]', ?, NULL, NULL, 1, ?, ?
        )`
      ).bind(
        JSON.stringify(["allowed@example.com"]),
        now.toISOString(),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO message_attachments
         (id, message_id, filename, content_type, size_bytes, content_id, r2_key, created_at)
         VALUES (
           'att_mcp_allowed', 'msg_mcp_allowed', 'hello.txt', 'text/plain', 5, NULL,
           'mail/mcp/hello.txt', ?
         )`
      ).bind(now.toISOString())
    ]);
    await env.MAIL_OBJECTS.put("mail/mcp/hello.txt", "hello", {
      httpMetadata: { contentType: "text/plain" }
    });
  });

  it("defaults dynamic registration to read and permits explicit mail-action scopes", async () => {
    const metadataResponse = await SELF.fetch(
      `${origin}/.well-known/oauth-authorization-server/api/auth`
    );
    expect(metadataResponse.status).toBe(200);
    const metadata = (await metadataResponse.json()) as { registration_endpoint?: string };
    expect(metadata.registration_endpoint).toBeTruthy();

    const registration = await SELF.fetch(metadata.registration_endpoint ?? "", {
      body: JSON.stringify({
        client_name: "HQBase MCP default scope test",
        redirect_uris: ["https://client.example/default-callback"],
        token_endpoint_auth_method: "none"
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(registration.status).toBe(201);
    const registered = (await registration.json()) as { scope?: string };
    expect(registered.scope?.split(" ")).toEqual(["mail:read"]);

    const fullRegistration = await SELF.fetch(metadata.registration_endpoint ?? "", {
      body: JSON.stringify({
        client_name: "HQBase MCP full scope test",
        redirect_uris: ["https://client.example/full-default-callback"],
        scope: fullScopes.join(" "),
        token_endpoint_auth_method: "none"
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(fullRegistration.status).toBe(201);
    const fullRegistered = (await fullRegistration.json()) as { scope?: string };
    expect(fullRegistered.scope?.split(" ").sort()).toEqual([...fullScopes].sort());
  });

  it("publishes distinct OAuth resource metadata and scope challenges", async () => {
    const readMetadata = await SELF.fetch(`${origin}/.well-known/oauth-protected-resource/mcp`);
    expect(readMetadata.status).toBe(200);
    await expect(readMetadata.json()).resolves.toMatchObject({
      resource: `${origin}/mcp`,
      authorization_servers: [`${origin}/api/auth`],
      scopes_supported: ["mail:read"]
    });
    const fullMetadata = await SELF.fetch(
      `${origin}/.well-known/oauth-protected-resource/mcp/full`
    );
    expect(fullMetadata.status).toBe(200);
    await expect(fullMetadata.json()).resolves.toMatchObject({
      resource: `${origin}/mcp/full`,
      authorization_servers: [`${origin}/api/auth`],
      scopes_supported: fullScopes
    });

    const readChallenge = await mcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "HQBase test", version: "1.0.0" }
      }
    });
    expect(readChallenge.status).toBe(401);
    expect(readChallenge.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://hqbase.test/.well-known/oauth-protected-resource/mcp"'
    );
    expect(readChallenge.headers.get("www-authenticate")).toContain('scope="mail:read"');

    const fullChallenge = await mcpRequest(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "HQBase test", version: "1.0.0" }
        }
      },
      undefined,
      "/mcp/full"
    );
    expect(fullChallenge.status).toBe(401);
    expect(fullChallenge.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://hqbase.test/.well-known/oauth-protected-resource/mcp/full"'
    );
    expect(fullChallenge.headers.get("www-authenticate")).toContain(
      'scope="mail:read mail:write mail:send"'
    );
  });

  it("enforces profile resources and caps the read-only profile", async () => {
    expect(await listToolNames(readToken)).toEqual(readToolNames);
    expect(await listToolNames(readProfileFullToken)).toEqual(readToolNames);
    expect(await listToolNames(fullToken, "/mcp/full")).toEqual([
      "list_mailboxes",
      "search_messages",
      "list_conversations",
      "get_message",
      "get_thread",
      "get_attachment",
      "update_message",
      "update_conversation",
      "list_drafts",
      "get_draft",
      "create_draft",
      "update_draft",
      "delete_draft",
      "add_draft_attachment",
      "remove_draft_attachment",
      "send_email",
      "reply_to_message",
      "forward_message"
    ]);
    await expect(
      mcpRequest({ jsonrpc: "2.0", id: 3, method: "tools/list" }, fullToken)
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      mcpRequest({ jsonrpc: "2.0", id: 4, method: "tools/list" }, readToken, "/mcp/full")
    ).resolves.toMatchObject({ status: 401 });
  });

  it("rejects MCP access while a user still has a temporary password", async () => {
    const timestamp = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO user_onboarding
       (user_id, method, status, created_by, created_at, updated_at)
       VALUES (?, 'temporary_password', 'pending', ?, ?, ?)`
    )
      .bind(userId, userId, timestamp, timestamp)
      .run();
    try {
      await expect(
        mcpRequest({ jsonrpc: "2.0", id: 40, method: "tools/list" }, readToken)
      ).resolves.toMatchObject({ status: 401 });
    } finally {
      await env.DB.prepare("DELETE FROM user_onboarding WHERE user_id = ?").bind(userId).run();
    }
  });

  it("filters mailbox results through live mailbox grants", async () => {
    const mailboxes = (await callTool("list_mailboxes", {}, readToken)) as Array<{ id: string }>;
    expect(mailboxes.map((mailbox) => mailbox.id)).toEqual(["mbx_allowed"]);
  });

  it("reads permitted threads and returns bounded embedded attachments", async () => {
    const thread = (await callTool(
      "get_thread",
      { messageId: "msg_mcp_allowed" },
      readToken
    )) as Array<{ id: string }>;
    expect(thread.map((message) => message.id)).toEqual(["msg_mcp_allowed"]);

    const response = await mcpRequest(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "get_attachment", arguments: { attachmentId: "att_mcp_allowed" } }
      },
      readToken
    );
    const payload = (await response.json()) as {
      result?: {
        content?: Array<
          | { type: "text"; text: string }
          | { type: "resource"; resource: { blob?: string; mimeType?: string } }
        >;
      };
    };
    expect(payload.result?.content?.[1]).toMatchObject({
      type: "resource",
      resource: { blob: "aGVsbG8=", mimeType: "text/plain" }
    });
  });

  it("creates revisioned drafts and stages base64 attachments with full consent", async () => {
    const created = (await callTool(
      "create_draft",
      {
        mailboxId: "mbx_allowed",
        from: "allowed@example.com",
        to: ["recipient@example.com"],
        subject: "Draft from MCP",
        text: "Review me"
      },
      fullToken,
      "/mcp/full"
    )) as { id: string; version: number };
    expect(created).toMatchObject({ version: 1 });

    const attachment = (await callTool(
      "add_draft_attachment",
      {
        draftId: created.id,
        filename: "draft.txt",
        contentType: "text/plain",
        contentBase64: "ZHJhZnQ="
      },
      fullToken,
      "/mcp/full"
    )) as { id: string; filename: string };
    expect(attachment.filename).toBe("draft.txt");

    const updated = (await callTool(
      "update_draft",
      {
        draftId: created.id,
        version: created.version,
        text: "Updated review"
      },
      fullToken,
      "/mcp/full"
    )) as { attachments: Array<{ id: string }>; text: string; version: number };
    expect(updated).toMatchObject({ text: "Updated review", version: 2 });
    expect(updated.attachments.map((item) => item.id)).toEqual([attachment.id]);

    await env.DB.prepare(
      "UPDATE mail_domains SET sending_status = 'disabled' WHERE id = 'dom_example'"
    ).run();
    await expect(
      callTool("get_draft", { draftId: created.id }, fullToken, "/mcp/full")
    ).resolves.toMatchObject({ id: created.id });
    await env.DB.prepare(
      "UPDATE mail_domains SET sending_status = 'ready' WHERE id = 'dom_example'"
    ).run();
  });

  it("applies conversation actions through agent access", async () => {
    await expect(
      callTool(
        "update_conversation",
        {
          action: "star",
          activeFolder: "inbox",
          messageId: "msg_mcp_allowed"
        },
        fullToken,
        "/mcp/full"
      )
    ).resolves.toMatchObject({ affected: 1, threadId: "thr_mcp_allowed" });
  });
});

async function listToolNames(accessToken: string, endpoint = "/mcp"): Promise<string[]> {
  const response = await mcpRequest(
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    accessToken,
    endpoint
  );
  expect(response.status).toBe(200);
  const payload = (await response.json()) as { result?: { tools?: Array<{ name: string }> } };
  return payload.result?.tools?.map((tool) => tool.name) ?? [];
}

async function callTool(
  name: string,
  args: unknown,
  accessToken: string,
  endpoint = "/mcp"
): Promise<unknown> {
  const response = await mcpRequest(
    {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name, arguments: args }
    },
    accessToken,
    endpoint
  );
  expect(response.status).toBe(200);
  const payload = (await response.json()) as {
    result?: { content?: Array<{ text?: string }>; isError?: boolean };
  };
  if (payload.result?.isError) {
    throw new Error(payload.result.content?.[0]?.text ?? `${name} failed without an error body.`);
  }
  return JSON.parse(payload.result?.content?.[0]?.text ?? "null") as unknown;
}

function mcpRequest(body: unknown, accessToken?: string, endpoint = "/mcp"): Promise<Response> {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": "2025-11-25"
  });
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return SELF.fetch(`${origin}${endpoint}`, {
    body: JSON.stringify(body),
    headers,
    method: "POST"
  });
}

async function applyMigration(source: string): Promise<void> {
  for (const statement of migrationStatements(source)) {
    await env.DB.prepare(statement).run();
  }
}
