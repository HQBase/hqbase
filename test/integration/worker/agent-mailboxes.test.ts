import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createAuth } from "../../../worker/auth/auth";
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
      mailboxStatement("mbx_agent_billing", "billing@example.com", "Billing")
    ]);
    await env.DB.batch([
      addressStatement("addr_agent_support", "mbx_agent_support", "support@example.com", "Support"),
      addressStatement("addr_agent_billing", "mbx_agent_billing", "billing@example.com", "Billing"),
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

    const mailboxes = await apiJson<Array<{ id: string; kind: string }>>("/api/v1/mailboxes", {
      token: requiredCredential(created)
    });
    expect(mailboxes.map(({ id }) => id)).toEqual(["mbx_agent_support"]);
    expect(mailboxes[0]?.kind).toBe("human");

    const messages = await apiJson<Array<{ id: string }>>("/api/v1/messages", {
      token: requiredCredential(created)
    });
    expect(messages.map(({ id }) => id)).toEqual(["msg_agent_support"]);

    const writeDenied = await SELF.fetch(`${origin}/api/v1/messages/msg_agent_support/archive`, {
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
        `SELECT m.is_active, a.address
         FROM mailboxes m JOIN mailbox_addresses a ON a.mailbox_id = m.id AND a.is_primary = 1
         WHERE m.id = 'mbx_agent_support'`
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
      "/api/v1/mailboxes",
      {
        token: requiredCredential(recovered)
      }
    );
    expect(childMailboxes.map(({ address }) => address)).toEqual(["orders-agent@example.com"]);
    expect(childMailboxes[0]?.kind).toBe("agent");

    const draft = await requestJson<{ id: string }>("/api/v1/drafts", {
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
    const ownerDrafts = await requestJson<Array<{ id: string }>>("/api/v1/drafts", {
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

    await requestJson<AgentMutation>(`/management/v1/agents/${provisioner.agent.id}`, {
      body: { isActive: false },
      cookie: ownerCookie,
      method: "PATCH"
    });
    expect(await mailApiStatus(requiredCredential(recovered))).toBe(200);
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
    await SELF.fetch(`${origin}/api/v1/mailboxes`, {
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
    `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).bind(id, address, displayName, stamp, stamp);
}

function addressStatement(
  id: string,
  mailboxId: string,
  address: string,
  displayName: string
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO mailbox_addresses
     (id, mailbox_id, mail_domain_id, local_part, address, display_name,
      receive_enabled, send_enabled, is_primary, created_at, updated_at)
     VALUES (?, ?, 'dom_agents', ?, ?, ?, 1, 1, 1, ?, ?)`
  ).bind(id, mailboxId, address.split("@")[0], address, displayName, stamp, stamp);
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
