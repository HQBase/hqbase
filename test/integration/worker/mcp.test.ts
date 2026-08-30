import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { hashOAuthToken } from "../../../worker/auth/oauth-token";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";
const userId = "usr_mcp_member";
const sessionId = "ses_mcp_member";
const readToken = "hqb_access_mcp-hqbase-read-token";
const readProfileFullToken = "hqb_access_mcp-hqbase-read-profile-full-token";
const fullToken = "hqb_access_mcp-hqbase-full-token";
const fullScopes = ["mail:read", "mail:write", "mail:send"];
const readToolNames = [
  "list_mailboxes",
  "list_labels",
  "search_messages",
  "list_conversations",
  "get_message",
  "get_thread",
  "get_attachment"
];

describe("HQBase MCP server", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
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
        `INSERT INTO mail_domains (
          id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at
        ) VALUES ('dom_example', 'example.com', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mailboxes
         (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_allowed', 'allowed@example.com', 'dom_example', 'Allowed', 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mailboxes
         (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
         VALUES ('mbx_hidden', 'hidden@example.com', 'dom_example', 'Hidden', 1, ?, ?)`
      ).bind(now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO mailbox_grants
         (mailbox_id, principal_id, access_level, created_by_principal_id, created_at, updated_at)
         VALUES ('mbx_allowed', ?, 'agent', ?, ?, ?)`
      ).bind(userId, userId, now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO labels
         (id, name, color, created_by_user_id, created_at, updated_at)
         VALUES ('lbl_mcp_customer', 'Customer', 'blue', ?, ?, ?)`
      ).bind(userId, now.toISOString(), now.toISOString()),
      env.DB.prepare(
        `INSERT INTO email_signatures
         (id, name, html_body, text_body, user_id, is_default, created_by, updated_by,
          created_at, updated_at)
         VALUES ('sig_mcp_default', 'MCP default', '<p>MCP signature</p>', 'MCP signature', ?, 1,
                 ?, ?, ?, ?)`
      ).bind(userId, userId, userId, now.toISOString(), now.toISOString()),
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
         VALUES
           ('thr_mcp_allowed', 'mcp allowed', ?, ?, ?),
           ('thr_mcp_unassigned', 'mcp unassigned', ?, ?, ?),
           ('thr_mcp_signature', 'mcp signature source', ?, ?, ?)`
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
        `INSERT INTO messages (
          id, thread_id, mailbox_id, direction, folder, from_address, to_json, cc_json, bcc_json,
          subject, snippet, text_body, message_id, dedupe_key, in_reply_to, references_json,
          received_at, sent_at, read_at, has_attachments, created_at, updated_at
        ) VALUES (
          'msg_mcp_signature', 'thr_mcp_signature', 'mbx_allowed', 'inbound', 'inbox',
          'signature-sender@example.com', ?, '[]', '[]', 'MCP signature source', 'Earlier signature body',
          'Earlier signature body', '<mcp-signature@example.com>', 'mcp-signature:allowed@example.com',
          NULL, '[]', ?, NULL, NULL, 0, ?, ?
        )`
      ).bind(
        JSON.stringify(["allowed@example.com"]),
        now.toISOString(),
        now.toISOString(),
        now.toISOString()
      ),
      env.DB.prepare(
        `INSERT INTO messages (
          id, thread_id, mailbox_id, is_unassigned, direction, folder, from_address,
          to_json, cc_json, bcc_json, subject, snippet, text_body, references_json,
          received_at, has_attachments, created_at, updated_at
        ) VALUES (
          'msg_mcp_unassigned', 'thr_mcp_unassigned', NULL, 1, 'inbound', 'catchall',
          'sender@example.com', '[]', '[]', '[]', 'MCP unassigned', 'Body', 'Body', '[]',
          ?, 0, ?, ?
        )`
      ).bind(now.toISOString(), now.toISOString(), now.toISOString()),
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

  it("registers the allowed scope capabilities while authorization still starts read-only", async () => {
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
    expect(registered.scope?.split(" ").sort()).toEqual(
      ["mail:read", "mail:write", "mail:send", "offline_access"].sort()
    );

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
    expect(fullRegistered.scope?.split(" ").sort()).toEqual(
      [...fullScopes, "offline_access"].sort()
    );
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
      "list_labels",
      "search_messages",
      "list_conversations",
      "get_message",
      "get_thread",
      "get_attachment",
      "add_label",
      "remove_label",
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
    const mailboxes = (await callTool("list_mailboxes", {}, readToken)) as Array<{
      address: string;
      addresses?: unknown;
      id: string;
      mailDomainId: string;
    }>;
    expect(mailboxes).toEqual([
      expect.objectContaining({
        address: "allowed@example.com",
        id: "mbx_allowed",
        mailDomainId: "dom_example"
      })
    ]);
    expect(mailboxes[0]).not.toHaveProperty("addresses");
  });

  it("lists, adds, filters, and removes shared labels", async () => {
    await expect(callTool("list_labels", {}, readToken)).resolves.toEqual([
      expect.objectContaining({ color: "blue", id: "lbl_mcp_customer", name: "Customer" })
    ]);

    await expect(
      callTool(
        "add_label",
        { labelId: "lbl_mcp_customer", messageId: "msg_mcp_allowed", target: "message" },
        fullToken,
        "/mcp/full"
      )
    ).resolves.toMatchObject({ affected: 1, assigned: true, labelId: "lbl_mcp_customer" });
    await expect(
      callTool("search_messages", { labelId: "lbl_mcp_customer" }, readToken)
    ).resolves.toMatchObject([
      { id: "msg_mcp_allowed", labels: [expect.objectContaining({ id: "lbl_mcp_customer" })] }
    ]);
    await expect(
      callTool(
        "remove_label",
        { labelId: "lbl_mcp_customer", messageId: "msg_mcp_allowed", target: "message" },
        fullToken,
        "/mcp/full"
      )
    ).resolves.toMatchObject({ affected: 1, assigned: false, labelId: "lbl_mcp_customer" });
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

  it("limits unassigned mail to the connected owner role", async () => {
    try {
      for (const role of ["member", "admin"] as const) {
        await setMcpUserRole(role);
        await expect(
          callTool("search_messages", { folder: "catchall" }, readToken)
        ).resolves.toEqual([]);
      }

      await setMcpUserRole("owner");
      await expect(
        callTool("search_messages", { folder: "catchall" }, readToken)
      ).resolves.toMatchObject([{ id: "msg_mcp_unassigned" }]);
      await expect(
        callTool("get_message", { messageId: "msg_mcp_unassigned" }, readToken)
      ).resolves.toMatchObject({ id: "msg_mcp_unassigned" });
      await expect(callTool("get_message", { messageId: "missing" }, readToken)).rejects.toThrow(
        "Message not found."
      );
    } finally {
      await setMcpUserRole("member");
    }
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
    )) as { id: string; signature: { id: string | null; mode: string }; version: number };
    expect(created).toMatchObject({
      signature: { id: "sig_mcp_default", mode: "automatic" },
      version: 1
    });
    await expect(
      callTool(
        "add_label",
        { draftId: created.id, labelId: "lbl_mcp_customer", target: "draft" },
        fullToken,
        "/mcp/full"
      )
    ).resolves.toMatchObject({
      affected: 1,
      assigned: true,
      draftId: created.id,
      labels: [expect.objectContaining({ id: "lbl_mcp_customer" })]
    });

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
    )) as { id: string; filename: string; inline: boolean };
    expect(attachment).toMatchObject({ filename: "draft.txt", inline: false });

    const updated = (await callTool(
      "update_draft",
      {
        draftId: created.id,
        version: created.version,
        text: "Updated review"
      },
      fullToken,
      "/mcp/full"
    )) as {
      attachments: Array<{ id: string }>;
      signature: { id: string | null; mode: string };
      text: string;
      version: number;
    };
    expect(updated).toMatchObject({
      signature: { id: "sig_mcp_default", mode: "automatic" },
      text: "Updated review",
      version: 2
    });
    expect(updated.attachments.map((item) => item.id)).toEqual([attachment.id]);

    const withoutSignature = (await callTool(
      "update_draft",
      {
        draftId: created.id,
        version: updated.version,
        signature: { mode: "none" }
      },
      fullToken,
      "/mcp/full"
    )) as { signature: { id: string | null; mode: string }; version: number };
    expect(withoutSignature).toMatchObject({
      signature: { id: null, mode: "none" },
      version: 3
    });

    await env.DB.prepare(
      "UPDATE mail_domains SET sending_status = 'disabled' WHERE id = 'dom_example'"
    ).run();
    await expect(
      callTool("get_draft", { draftId: created.id }, fullToken, "/mcp/full")
    ).resolves.toMatchObject({
      id: created.id,
      labels: [expect.objectContaining({ id: "lbl_mcp_customer" })],
      signature: { id: null, mode: "none" }
    });
    await env.DB.prepare(
      "UPDATE mail_domains SET sending_status = 'ready' WHERE id = 'dom_example'"
    ).run();
  });

  it("stages safe inline draft images with a private HTML source", async () => {
    const created = (await callTool(
      "create_draft",
      {
        mailboxId: "mbx_allowed",
        from: "allowed@example.com",
        to: ["recipient@example.com"],
        subject: "Inline image from MCP",
        text: "Flowers"
      },
      fullToken,
      "/mcp/full"
    )) as { id: string; version: number };

    const attachment = (await callTool(
      "add_draft_attachment",
      {
        draftId: created.id,
        filename: "flowers.png",
        contentType: "image/png",
        contentBase64: "iVBORw0KGgo=",
        inline: true
      },
      fullToken,
      "/mcp/full"
    )) as { htmlSrc: string; id: string; inline: boolean };
    expect(attachment).toMatchObject({
      htmlSrc: `/api/v2/drafts/${created.id}/attachments/${attachment.id}/inline`,
      inline: true
    });
    await expect(
      env.DB.prepare("SELECT content_id FROM draft_attachments WHERE id = ?")
        .bind(attachment.id)
        .first<{ content_id: string }>()
    ).resolves.toEqual({ content_id: `${attachment.id}@hqbase.invalid` });

    const updated = (await callTool(
      "update_draft",
      {
        draftId: created.id,
        version: created.version,
        html: `<p>Flowers</p><img src="${attachment.htmlSrc}" alt="Flowers">`
      },
      fullToken,
      "/mcp/full"
    )) as { html: string };
    expect(updated.html).toContain(attachment.htmlSrc);
    await expect(
      callTool(
        "add_draft_attachment",
        {
          draftId: created.id,
          filename: "spoofed.png",
          contentType: "image/png",
          contentBase64: "bm90IGFuIGltYWdl",
          inline: true
        },
        fullToken,
        "/mcp/full"
      )
    ).rejects.toThrow("File cannot be displayed inline.");
    await expect(
      env.DB.prepare("SELECT COUNT(*) AS count FROM draft_attachments WHERE draft_id = ?")
        .bind(created.id)
        .first<{ count: number }>()
    ).resolves.toEqual({ count: 1 });
  });

  it("defaults MCP sends, replies, and forwards to the automatic signature", async () => {
    const sent = (await callTool(
      "send_email",
      {
        from: "allowed@example.com",
        to: ["reader@example.net"],
        subject: "MCP signature send",
        text: "Send authored"
      },
      fullToken,
      "/mcp/full"
    )) as { id: string };
    expect(await storedText(sent.id)).toBe("Send authored\n\nMCP signature");

    const replied = (await callTool(
      "reply_to_message",
      {
        from: "allowed@example.com",
        messageId: "msg_mcp_signature",
        text: "Reply authored"
      },
      fullToken,
      "/mcp/full"
    )) as { id: string };
    const replyText = await storedText(replied.id);
    expect(replyText.indexOf("Reply authored")).toBeLessThan(replyText.indexOf("MCP signature"));
    expect(replyText.indexOf("MCP signature")).toBeLessThan(
      replyText.indexOf("Earlier signature body")
    );

    const forwarded = (await callTool(
      "forward_message",
      {
        from: "allowed@example.com",
        includeOriginalAttachments: false,
        messageId: "msg_mcp_signature",
        text: "Forward authored",
        to: ["reader@example.net"]
      },
      fullToken,
      "/mcp/full"
    )) as { id: string };
    const forwardText = await storedText(forwarded.id);
    expect(forwardText.indexOf("Forward authored")).toBeLessThan(
      forwardText.indexOf("MCP signature")
    );
    expect(forwardText.indexOf("MCP signature")).toBeLessThan(
      forwardText.indexOf("Forwarded message")
    );

    const savedForwardDraft = (await callTool(
      "create_draft",
      {
        mailboxId: "mbx_allowed",
        forwardOfMessageId: "msg_mcp_allowed",
        from: "allowed@example.com",
        subject: "Fwd: MCP allowed",
        text: "Saved forward authored",
        to: ["reader@example.net"]
      },
      fullToken,
      "/mcp/full"
    )) as { id: string };
    const savedForward = (await callTool(
      "send_email",
      {
        attachmentIds: [],
        draftId: savedForwardDraft.id,
        from: "allowed@example.com",
        subject: "Fwd: MCP allowed",
        text: "Saved forward authored",
        to: ["reader@example.net"]
      },
      fullToken,
      "/mcp/full"
    )) as { id: string };
    const savedForwardText = await storedText(savedForward.id);
    expect(savedForwardText.indexOf("Saved forward authored")).toBeLessThan(
      savedForwardText.indexOf("MCP signature")
    );
    expect(savedForwardText.indexOf("MCP signature")).toBeLessThan(
      savedForwardText.indexOf("Forwarded message")
    );
    const savedForwardAttachments = await env.DB.prepare(
      "SELECT filename FROM message_attachments WHERE message_id = ? ORDER BY filename"
    )
      .bind(savedForward.id)
      .all<{ filename: string }>();
    expect(savedForwardAttachments.results).toEqual([{ filename: "hello.txt" }]);
    expect(
      await env.DB.prepare("SELECT id FROM drafts WHERE id = ?").bind(savedForwardDraft.id).first()
    ).toBeNull();

    const unsigned = (await callTool(
      "send_email",
      {
        from: "allowed@example.com",
        signature: { mode: "none" },
        subject: "MCP unsigned send",
        text: "Unsigned body",
        to: ["reader@example.net"]
      },
      fullToken,
      "/mcp/full"
    )) as { id: string };
    expect(await storedText(unsigned.id)).toBe("Unsigned body");
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
    await expect(
      callTool(
        "update_conversation",
        {
          action: "archive",
          activeFolder: "inbox",
          messageId: "msg_mcp_allowed"
        },
        fullToken,
        "/mcp/full"
      )
    ).resolves.toMatchObject({ affected: 1, threadId: "thr_mcp_allowed" });
    await expect(
      callTool(
        "update_conversation",
        {
          action: "unarchive",
          activeFolder: "archived",
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

async function storedText(messageId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT text_body FROM messages WHERE id = ?")
    .bind(messageId)
    .first<{ text_body: string }>();
  if (!row) throw new Error("MCP sent message was not stored.");
  return row.text_body;
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

async function setMcpUserRole(role: "admin" | "member" | "owner"): Promise<void> {
  await env.DB.prepare(`UPDATE "user" SET role = ? WHERE id = ?`).bind(role, userId).run();
}
