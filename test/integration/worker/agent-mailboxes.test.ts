import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
import { findMailboxForReceiving } from "../../../worker/features/mailboxes/queries";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";
const stamp = "2026-08-23T14:00:00.000Z";
let ownerCookie = "";

describe("agent mailboxes", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    const auth = createAuth(env, new Request(`${origin}/api/auth/sign-up/email`));
    const signUp = await auth.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email: "agent-owner@login.example",
          name: "Agent Owner",
          password: "agent-mailbox-owner-password",
          rememberMe: false
        }),
        headers: { "content-type": "application/json", origin },
        method: "POST"
      })
    );
    expect(signUp.status, await signUp.clone().text()).toBe(200);
    ownerCookie = extractSessionCookie(signUp);
    await env.DB.prepare(
      `UPDATE "user" SET role = 'owner' WHERE email = 'agent-owner@login.example'`
    ).run();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
         VALUES ('dom_agents', 'example.com', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(stamp, stamp),
      mailboxStatement("mbx_agent_support", "support@example.com", "Support"),
      mailboxStatement("mbx_agent_billing", "billing@example.com", "Billing"),
      threadStatement("thr_agent_support", "Support message"),
      threadStatement("thr_agent_billing", "Billing message"),
      threadStatement("thr_agent_unassigned", "Unassigned message")
    ]);
    await env.DB.batch([
      messageStatement("msg_agent_support", "thr_agent_support", "mbx_agent_support", 0),
      messageStatement("msg_agent_billing", "thr_agent_billing", "mbx_agent_billing", 0),
      messageStatement("msg_agent_unassigned", "thr_agent_unassigned", null, 1)
    ]);
  });

  it("gives a mailbox agent only its complete assigned mailbox and safely rotates or disables it", async () => {
    const created = await requestJson<AgentMutation>("/management/v1/agents", {
      body: {
        profile: "mailbox",
        name: "Support reader",
        accessLevel: "read",
        mailbox: { id: "mbx_agent_support" }
      },
      cookie: ownerCookie,
      method: "POST",
      status: 201
    });
    expect(created.credential).toMatch(/^hqb_agent_/u);
    expect(created.agent).toMatchObject({
      name: "Support reader",
      profile: "mailbox",
      accessLevel: "read",
      mailbox: { id: "mbx_agent_support", address: "support@example.com" }
    });

    const stored = await env.DB.prepare(
      `SELECT secret_hash, scopes_json FROM agent_credentials WHERE principal_id = ?`
    )
      .bind(created.agent.id)
      .first<{ secret_hash: string; scopes_json: string }>();
    expect(stored?.secret_hash).not.toContain(created.credential ?? "");
    expect(JSON.parse(stored?.scopes_json ?? "[]")).toEqual(["mail:read"]);

    const mailboxes = await apiJson<Array<{ id: string; kind: string }>>("/api/v2/mailboxes", {
      token: requiredCredential(created)
    });
    expect(mailboxes.map(({ id }) => id)).toEqual(["mbx_agent_support"]);
    expect(mailboxes[0]?.kind).toBe("human");

    const messages = await apiJson<Array<{ id: string }>>("/api/v2/messages", {
      token: requiredCredential(created)
    });
    expect(messages.map(({ id }) => id)).toEqual(["msg_agent_support"]);

    const v1Agent = await SELF.fetch(`${origin}/api/v1/mailboxes`, {
      headers: { authorization: `Bearer ${requiredCredential(created)}` }
    });
    expect(v1Agent.status).toBe(401);

    const writeDenied = await SELF.fetch(`${origin}/api/v2/messages/msg_agent_support/archive`, {
      headers: { authorization: `Bearer ${requiredCredential(created)}` },
      method: "POST"
    });
    expect(writeDenied.status).toBe(403);
    await expect(writeDenied.json()).resolves.toMatchObject({
      error: { code: "INSUFFICIENT_SCOPE" }
    });

    const rotated = await requestJson<AgentMutation>(
      `/management/v1/agents/${created.agent.id}/credential`,
      { cookie: ownerCookie, method: "POST", status: 201 }
    );
    expect(rotated.credential).toMatch(/^hqb_agent_/u);
    expect(rotated.credential).not.toBe(created.credential);
    expect(await mailApiStatus(requiredCredential(created))).toBe(401);
    expect(await mailApiStatus(requiredCredential(rotated))).toBe(200);

    const disabled = await requestJson<AgentMutation>(`/management/v1/agents/${created.agent.id}`, {
      body: { isActive: false },
      cookie: ownerCookie,
      method: "PATCH"
    });
    expect(disabled.agent.isActive).toBe(false);
    expect(disabled.credential).toBeUndefined();
    expect(await mailApiStatus(requiredCredential(rotated))).toBe(401);

    expect(
      await env.DB.prepare(
        `SELECT is_active, address FROM mailboxes WHERE id = 'mbx_agent_support'`
      ).first()
    ).toEqual({ is_active: 1, address: "support@example.com" });

    const enabled = await requestJson<AgentMutation>(`/management/v1/agents/${created.agent.id}`, {
      body: { isActive: true },
      cookie: ownerCookie,
      method: "PATCH"
    });
    expect(enabled.agent.isActive).toBe(true);
    expect(enabled.credential).toMatch(/^hqb_agent_/u);
    expect(await mailApiStatus(requiredCredential(enabled))).toBe(200);

    const listed = await requestJson<{ agents: Array<Record<string, unknown>> }>(
      "/management/v1/agents",
      { cookie: ownerCookie }
    );
    expect(JSON.stringify(listed)).not.toContain(requiredCredential(enabled));

    const humanGrants = await requestJson<Array<{ userId: string }>>("/api/mailbox-grants", {
      cookie: ownerCookie
    });
    expect(humanGrants.map((grant) => grant.userId)).not.toContain(created.agent.id);
  });

  it("keeps the provisioner's own credential out of the Mail API", async () => {
    const provisioner = await requestJson<AgentMutation>("/management/v1/agents", {
      body: {
        profile: "provisioner",
        name: "Mailbox factory",
        mailDomainId: "dom_agents",
        mailboxLimit: 1
      },
      cookie: ownerCookie,
      method: "POST",
      status: 201
    });
    expect(provisioner.agent).toMatchObject({
      profile: "provisioner",
      mailDomain: { id: "dom_agents", domain: "example.com" },
      mailboxLimit: 1,
      mailboxCount: 0
    });

    const child = await requestJson<AgentMutation>("/management/v1/agents", {
      body: {
        profile: "mailbox",
        name: "Orders agent",
        accessLevel: "agent",
        mailbox: { address: "orders-agent@example.com", displayName: "Orders agent" }
      },
      method: "POST",
      status: 201,
      token: requiredCredential(provisioner)
    });
    expect(child.agent).toMatchObject({
      profile: "mailbox",
      accessLevel: "agent",
      mailbox: { address: "orders-agent@example.com" }
    });

    const provisioned = await requestJson<{ agents: AgentMutation["agent"][] }>(
      "/management/v1/agents",
      { token: requiredCredential(provisioner) }
    );
    expect(provisioned.agents.map(({ id }) => id)).toEqual([child.agent.id]);

    const recovered = await requestJson<AgentMutation>(
      `/management/v1/agents/${child.agent.id}/credential`,
      { method: "POST", status: 201, token: requiredCredential(provisioner) }
    );
    expect(recovered.credential).toMatch(/^hqb_agent_/u);
    expect(recovered.credential).not.toBe(child.credential);
    expect(await mailApiStatus(requiredCredential(child))).toBe(401);
    expect(await mailApiStatus(requiredCredential(recovered))).toBe(200);

    expect(await mailApiStatus(requiredCredential(provisioner))).toBe(401);
    const wrongAudience = await SELF.fetch(`${origin}/management/v1/agents`, {
      body: JSON.stringify({
        profile: "mailbox",
        name: "Wrong audience",
        accessLevel: "read",
        mailbox: { address: "wrong@example.com", displayName: "Wrong" }
      }),
      headers: {
        authorization: `Bearer ${requiredCredential(recovered)}`,
        "content-type": "application/json"
      },
      method: "POST"
    });
    expect(wrongAudience.status).toBe(401);

    const childMailboxes = await apiJson<Array<{ address: string; kind: string }>>(
      "/api/v2/mailboxes",
      {
        token: requiredCredential(recovered)
      }
    );
    expect(childMailboxes.map(({ address }) => address)).toEqual(["orders-agent@example.com"]);
    expect(childMailboxes[0]?.kind).toBe("agent");

    const draft = await requestJson<{ id: string }>("/api/v2/drafts", {
      body: {
        mailboxId: child.agent.mailbox?.id,
        from: "orders-agent@example.com",
        to: ["customer@example.net"],
        subject: "Order update",
        text: "Your order is ready."
      },
      method: "POST",
      status: 201,
      token: requiredCredential(recovered)
    });
    expect(draft.id).toMatch(/^drf_/u);
    const ownerDrafts = await requestJson<Array<{ id: string }>>("/api/v2/drafts", {
      cookie: ownerCookie
    });
    expect(ownerDrafts.map(({ id }) => id)).not.toContain(draft.id);

    const overLimit = await SELF.fetch(`${origin}/management/v1/agents`, {
      body: JSON.stringify({
        profile: "mailbox",
        name: "Second orders agent",
        accessLevel: "read",
        mailbox: { address: "orders-two@example.com", displayName: "Orders two" }
      }),
      headers: {
        authorization: `Bearer ${requiredCredential(provisioner)}`,
        "content-type": "application/json"
      },
      method: "POST"
    });
    expect(overLimit.status).toBe(409);
    await expect(overLimit.json()).resolves.toMatchObject({
      error: { code: "PROVISIONER_LIMIT_REACHED" }
    });

    expect(
      await env.DB.prepare(
        `SELECT actor_type, actor_id FROM audit_events
         WHERE action = 'agent.create' AND resource_id = ?`
      )
        .bind(child.agent.id)
        .first()
    ).toEqual({ actor_type: "agent", actor_id: provisioner.agent.id });

    expect(
      await env.DB.prepare(
        `SELECT actor_type, actor_id FROM audit_events
         WHERE action = 'agent.credential.reissue' AND resource_id = ?`
      )
        .bind(child.agent.id)
        .first()
    ).toEqual({ actor_type: "agent", actor_id: provisioner.agent.id });

    const foreignRotate = await SELF.fetch(
      `${origin}/management/v1/agents/${provisioner.agent.id}/credential`,
      {
        headers: { authorization: `Bearer ${requiredCredential(provisioner)}` },
        method: "POST"
      }
    );
    expect(foreignRotate.status).toBe(403);
    await expect(foreignRotate.json()).resolves.toMatchObject({
      error: { code: "PROVISIONER_CHILD_FORBIDDEN" }
    });

    const ownerAgents = await requestJson<{ agents: AgentMutation["agent"][] }>(
      "/management/v1/agents",
      { cookie: ownerCookie }
    );
    const humanCreatedAgent = ownerAgents.agents.find(({ name }) => name === "Support reader");
    expect(humanCreatedAgent).toBeDefined();
    const foreignDelete = await SELF.fetch(
      `${origin}/management/v1/agents/${humanCreatedAgent?.id ?? "missing"}`,
      {
        headers: { authorization: `Bearer ${requiredCredential(provisioner)}` },
        method: "DELETE"
      }
    );
    expect(foreignDelete.status).toBe(403);
    await expect(foreignDelete.json()).resolves.toMatchObject({
      error: { code: "PROVISIONER_CHILD_FORBIDDEN" }
    });

    const deprovisioned = await requestJson<AgentMutation>(
      `/management/v1/agents/${child.agent.id}`,
      { method: "DELETE", token: requiredCredential(provisioner) }
    );
    expect(deprovisioned.agent).toMatchObject({
      id: child.agent.id,
      isActive: false,
      mailbox: { id: child.agent.mailbox?.id, isDeleted: true }
    });
    const firstDeletion = await env.DB.prepare("SELECT deleted_at FROM mailboxes WHERE id = ?")
      .bind(child.agent.mailbox?.id)
      .first<{ deleted_at: string }>();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const repeated = await requestJson<AgentMutation>(`/management/v1/agents/${child.agent.id}`, {
      method: "DELETE",
      token: requiredCredential(provisioner)
    });
    expect(repeated.agent).toMatchObject({
      id: child.agent.id,
      isActive: false,
      mailbox: { isDeleted: true }
    });
    await expect(
      env.DB.prepare("SELECT deleted_at FROM mailboxes WHERE id = ?")
        .bind(child.agent.mailbox?.id)
        .first()
    ).resolves.toEqual(firstDeletion);
    const deprovisionAudits = await env.DB.prepare(
      `SELECT occurred_at FROM audit_events
       WHERE action = 'mailbox.deprovision' AND resource_id = ?
       ORDER BY rowid`
    )
      .bind(child.agent.id)
      .all<{ occurred_at: string }>();
    expect(deprovisionAudits.results).toHaveLength(2);
    expect(Date.parse(deprovisionAudits.results[1]?.occurred_at ?? "")).toBeGreaterThan(
      Date.parse(deprovisionAudits.results[0]?.occurred_at ?? "")
    );
    expect(await mailApiStatus(requiredCredential(recovered))).toBe(401);

    const listedAfterDelete = await requestJson<{ agents: AgentMutation["agent"][] }>(
      "/management/v1/agents",
      { token: requiredCredential(provisioner) }
    );
    expect(listedAfterDelete.agents).toContainEqual(
      expect.objectContaining({
        id: child.agent.id,
        isActive: false,
        mailbox: expect.objectContaining({ isDeleted: true })
      })
    );

    const hiddenMailboxes = await requestJson<Array<{ id: string }>>("/api/v2/mailboxes", {
      cookie: ownerCookie
    });
    expect(hiddenMailboxes.map(({ id }) => id)).not.toContain(child.agent.mailbox?.id);
    const deletedMailboxes = await requestJson<Array<{ id: string; deletedAt: string | null }>>(
      "/api/mailboxes/deleted",
      { cookie: ownerCookie }
    );
    expect(deletedMailboxes).toContainEqual(
      expect.objectContaining({ id: child.agent.mailbox?.id, deletedAt: expect.any(String) })
    );
    expect(
      await env.DB.prepare("SELECT mailbox_id FROM drafts WHERE id = ?").bind(draft.id).first()
    ).toEqual({ mailbox_id: child.agent.mailbox?.id });

    const rotateDeleted = await requestJson<{ error: { code: string } }>(
      `/management/v1/agents/${child.agent.id}/credential`,
      { method: "POST", status: 409, token: requiredCredential(provisioner) }
    );
    expect(rotateDeleted.error.code).toBe("MAILBOX_DELETED");

    const replacement = await requestJson<AgentMutation>("/management/v1/agents", {
      body: {
        profile: "mailbox",
        name: "Replacement orders agent",
        accessLevel: "read",
        mailbox: { address: "orders-two@example.com", displayName: "Orders two" }
      },
      method: "POST",
      status: 201,
      token: requiredCredential(provisioner)
    });
    expect(replacement.agent.mailbox).toMatchObject({
      address: "orders-two@example.com",
      isDeleted: false
    });

    await requestJson<AgentMutation>(`/management/v1/agents/${provisioner.agent.id}`, {
      body: { isActive: false },
      cookie: ownerCookie,
      method: "PATCH"
    });
    expect(await mailApiStatus(requiredCredential(replacement))).toBe(200);
  });

  it("lets an owner restore a soft-deleted mailbox without restoring its agent credential", async () => {
    const created = await requestJson<AgentMutation>("/management/v1/agents", {
      body: {
        profile: "mailbox",
        name: "Billing agent",
        accessLevel: "read",
        mailbox: { id: "mbx_agent_billing" }
      },
      cookie: ownerCookie,
      method: "POST",
      status: 201
    });
    const originalCredential = requiredCredential(created);
    const observer = await requestJson<AgentMutation>("/management/v1/agents", {
      body: {
        profile: "mailbox",
        name: "Billing observer",
        accessLevel: "read",
        mailbox: { id: "mbx_agent_billing" }
      },
      cookie: ownerCookie,
      method: "POST",
      status: 201
    });
    const observerCredential = requiredCredential(observer);
    const messageChangesBefore = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM message_changes WHERE message_id = 'msg_agent_billing'"
    ).first<{ count: number }>();

    const deleted = await requestJson<{ id: string; deletedAt: string | null }>(
      "/api/mailboxes/mbx_agent_billing",
      { cookie: ownerCookie, method: "DELETE" }
    );
    expect(deleted).toMatchObject({ id: "mbx_agent_billing", deletedAt: expect.any(String) });
    expect(await mailApiStatus(originalCredential)).toBe(401);
    expect(await mailApiStatus(observerCredential)).toBe(401);
    await expect(findMailboxForReceiving(env.DB, "billing@example.com")).resolves.toBeNull();

    const visibleMailboxes = await requestJson<Array<{ id: string }>>("/api/v2/mailboxes", {
      cookie: ownerCookie
    });
    expect(visibleMailboxes.map(({ id }) => id)).not.toContain("mbx_agent_billing");
    const visibleMessages = await requestJson<Array<{ id: string }>>("/api/v2/messages", {
      cookie: ownerCookie
    });
    expect(visibleMessages.map(({ id }) => id)).not.toContain("msg_agent_billing");
    const deletedMailboxes = await requestJson<Array<{ id: string }>>("/api/mailboxes/deleted", {
      cookie: ownerCookie
    });
    expect(deletedMailboxes.map(({ id }) => id)).toContain("mbx_agent_billing");
    expect(
      await env.DB.prepare(
        "SELECT mailbox_id, is_unassigned FROM messages WHERE id = 'msg_agent_billing'"
      ).first()
    ).toEqual({ mailbox_id: "mbx_agent_billing", is_unassigned: 0 });

    const agents = await requestJson<{ agents: AgentMutation["agent"][] }>(
      "/management/v1/agents",
      { cookie: ownerCookie }
    );
    expect(agents.agents).toContainEqual(
      expect.objectContaining({
        id: created.agent.id,
        isActive: false,
        mailbox: expect.objectContaining({ id: "mbx_agent_billing", isDeleted: true })
      })
    );
    expect(agents.agents).toContainEqual(
      expect.objectContaining({
        id: observer.agent.id,
        isActive: false,
        mailbox: expect.objectContaining({ id: "mbx_agent_billing", isDeleted: true })
      })
    );

    const rotateDeleted = await requestJson<{ error: { code: string } }>(
      `/management/v1/agents/${created.agent.id}/credential`,
      { cookie: ownerCookie, method: "POST", status: 409 }
    );
    expect(rotateDeleted.error.code).toBe("MAILBOX_DELETED");
    const enableDeleted = await requestJson<{ error: { code: string } }>(
      `/management/v1/agents/${created.agent.id}`,
      { body: { isActive: true }, cookie: ownerCookie, method: "PATCH", status: 409 }
    );
    expect(enableDeleted.error.code).toBe("MAILBOX_DELETED");

    const restored = await requestJson<{ id: string; deletedAt: string | null }>(
      "/api/mailboxes/mbx_agent_billing/restore",
      { cookie: ownerCookie, method: "POST" }
    );
    expect(restored).toMatchObject({ id: "mbx_agent_billing", deletedAt: null });
    expect(await mailApiStatus(originalCredential)).toBe(401);
    expect(await mailApiStatus(observerCredential)).toBe(401);
    await expect(findMailboxForReceiving(env.DB, "billing@example.com")).resolves.toMatchObject({
      id: "mbx_agent_billing"
    });
    const restoredMessages = await requestJson<Array<{ id: string }>>("/api/v2/messages", {
      cookie: ownerCookie
    });
    expect(restoredMessages.map(({ id }) => id)).toContain("msg_agent_billing");
    await expect(
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM message_changes WHERE message_id = 'msg_agent_billing'"
      ).first()
    ).resolves.toEqual(messageChangesBefore);

    const restoredAgents = await requestJson<{ agents: AgentMutation["agent"][] }>(
      "/management/v1/agents",
      { cookie: ownerCookie }
    );
    expect(restoredAgents.agents).toContainEqual(
      expect.objectContaining({
        id: created.agent.id,
        isActive: false,
        mailbox: expect.objectContaining({ id: "mbx_agent_billing", isDeleted: false })
      })
    );
    expect(restoredAgents.agents).toContainEqual(
      expect.objectContaining({
        id: observer.agent.id,
        isActive: false,
        mailbox: expect.objectContaining({ id: "mbx_agent_billing", isDeleted: false })
      })
    );

    await env.DB.prepare(
      `CREATE TRIGGER test_fail_agent_enable_audit
       BEFORE INSERT ON audit_events
       WHEN NEW.action = 'agent.enable'
       BEGIN
         SELECT RAISE(ABORT, 'TEST_AUDIT_FAILURE');
       END`
    ).run();
    try {
      const failedEnable = await SELF.fetch(`${origin}/management/v1/agents/${created.agent.id}`, {
        body: JSON.stringify({ isActive: true }),
        headers: { "content-type": "application/json", cookie: ownerCookie },
        method: "PATCH"
      });
      expect(failedEnable.status).toBe(500);
      await expect(
        env.DB.prepare("SELECT status FROM principals WHERE id = ?").bind(created.agent.id).first()
      ).resolves.toEqual({ status: "disabled" });
      await expect(
        env.DB.prepare(
          "SELECT COUNT(*) AS count FROM agent_credentials WHERE principal_id = ? AND revoked_at IS NULL"
        )
          .bind(created.agent.id)
          .first()
      ).resolves.toEqual({ count: 0 });
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS test_fail_agent_enable_audit").run();
    }

    const enabled = await requestJson<AgentMutation>(`/management/v1/agents/${created.agent.id}`, {
      body: { isActive: true },
      cookie: ownerCookie,
      method: "PATCH"
    });
    expect(enabled.agent.isActive).toBe(true);
    expect(enabled.credential).toMatch(/^hqb_agent_/u);
    expect(enabled.credential).not.toBe(originalCredential);
    expect(await mailApiStatus(requiredCredential(enabled))).toBe(200);
  });
});

type AgentMutation = {
  agent: {
    id: string;
    isActive: boolean;
    mailbox?: { id: string };
    [key: string]: unknown;
  };
  credential?: string;
};

async function requestJson<T>(
  path: string,
  options: {
    body?: unknown;
    cookie?: string;
    method?: string;
    status?: number;
    token?: string;
  } = {}
): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  const response = await SELF.fetch(`${origin}${path}`, {
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    headers,
    method: options.method ?? "GET"
  });
  expect(response.status, await response.clone().text()).toBe(options.status ?? 200);
  return response.json<T>();
}

function apiJson<T>(path: string, options: { token: string }): Promise<T> {
  return requestJson<T>(path, options);
}

async function mailApiStatus(token: string): Promise<number> {
  return (
    await SELF.fetch(`${origin}/api/v2/mailboxes`, {
      headers: { authorization: `Bearer ${token}` }
    })
  ).status;
}

function requiredCredential(result: AgentMutation): string {
  if (!result.credential) throw new Error("Expected a one-time agent credential.");
  return result.credential;
}

function mailboxStatement(id: string, address: string, displayName: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO mailboxes
     (id, address, mail_domain_id, display_name, is_active, created_at, updated_at)
     VALUES (?, ?, 'dom_agents', ?, 1, ?, ?)`
  ).bind(id, address, displayName, stamp, stamp);
}

function threadStatement(id: string, subject: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO threads (id, subject_normalized, last_message_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, subject.toLowerCase(), stamp, stamp, stamp);
}

function messageStatement(
  id: string,
  threadId: string,
  mailboxId: string | null,
  isUnassigned: 0 | 1
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO messages
     (id, thread_id, mailbox_id, is_unassigned, direction, folder, from_address,
      to_json, cc_json, bcc_json, subject, snippet, text_body, references_json,
      received_at, has_attachments, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'inbound', ?, 'sender@example.net', '[]', '[]', '[]',
             ?, 'Body', 'Body', '[]', ?, 0, ?, ?)`
  ).bind(
    id,
    threadId,
    mailboxId,
    isUnassigned,
    isUnassigned === 1 ? "catchall" : "inbox",
    id,
    stamp,
    stamp,
    stamp
  );
}

function extractSessionCookie(response: Response): string {
  const raw = response.headers.get("set-cookie") ?? "";
  return raw.split(";")[0] ?? "";
}
