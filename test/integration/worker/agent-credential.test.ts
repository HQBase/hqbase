import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import {
  AgentBearerError,
  authenticateAgentBearer,
  createAgentCredential,
  hashAgentCredentialSecret
} from "../../../worker/auth/agent-credential";
import type { WorkerEnv } from "../../../worker/lib/env";
import { applyCurrentMigrations } from "./current-migrations";

const origin = "https://hqbase.test";
const stamp = "2026-08-23T12:00:00.000Z";
let credential = "";

describe("agent bearer credentials", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, role)
         VALUES ('usr_agent_creator', 'Agent Creator', 'agent-creator@example.com',
                 1, ?, ?, 'owner')`
      ).bind(stamp, stamp),
      env.DB.prepare(
        `INSERT INTO mail_domains
         (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
         VALUES ('dom_agent_auth', 'agents.example.com', 'ready', 'ready', 'ready', 1, ?, ?)`
      ).bind(stamp, stamp)
    ]);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO principals (id, type, name, status, created_at, updated_at)
         VALUES ('agt_mail_auth', 'agent', 'Mail Agent', 'active', ?, ?)`
      ).bind(stamp, stamp),
      env.DB.prepare(
        `INSERT INTO agents
         (principal_id, profile, created_by_principal_id, mail_domain_id, mailbox_limit,
          created_at, updated_at)
         VALUES ('agt_mail_auth', 'mailbox', 'usr_agent_creator', 'dom_agent_auth', NULL, ?, ?)`
      ).bind(stamp, stamp)
    ]);

    const issued = await createAgentCredential();
    credential = issued.token;
    await env.DB.prepare(
      `INSERT INTO agent_credentials
       (id, principal_id, secret_hash, resource, scopes_json, created_at)
       VALUES ('cred_mail_auth', 'agt_mail_auth', ?, 'mail', '["mail:read","mail:send"]', ?)`
    )
      .bind(issued.secretHash, stamp)
      .run();
  });

  it("returns a typed agent principal and only allowed scopes", async () => {
    const result = await authenticateAgentBearer(bearerRequest(credential), env as WorkerEnv, {
      resource: "mail",
      allowedScopes: ["mail:read"]
    });

    expect(result.principal).toEqual({
      id: "agt_mail_auth",
      type: "agent",
      name: "Mail Agent",
      role: null,
      profile: "mailbox"
    });
    expect(result.credentialId).toBe("cred_mail_auth");
    expect([...result.scopes]).toEqual(["mail:read"]);
  });

  it("stores a hash instead of the one-time bearer credential", async () => {
    const stored = await env.DB.prepare(
      "SELECT secret_hash FROM agent_credentials WHERE id = 'cred_mail_auth'"
    ).first<{ secret_hash: string }>();
    const secret = credential.slice("hqb_agent_".length);

    expect(stored?.secret_hash).toBe(await hashAgentCredentialSecret(secret));
    expect(stored?.secret_hash).not.toContain(secret);
    expect(stored?.secret_hash).not.toContain(credential);
  });

  it("rejects the wrong API resource, revocation, and disabled agents", async () => {
    await expect(
      authenticateAgentBearer(bearerRequest(credential), env as WorkerEnv, {
        resource: "management",
        allowedScopes: ["mailbox:provision"]
      })
    ).rejects.toBeInstanceOf(AgentBearerError);

    await env.DB.prepare("UPDATE agent_credentials SET revoked_at = ? WHERE id = 'cred_mail_auth'")
      .bind(stamp)
      .run();
    await expect(
      authenticateAgentBearer(bearerRequest(credential), env as WorkerEnv, {
        resource: "mail",
        allowedScopes: ["mail:read"]
      })
    ).rejects.toBeInstanceOf(AgentBearerError);

    await env.DB.prepare(
      "UPDATE agent_credentials SET revoked_at = NULL WHERE id = 'cred_mail_auth'"
    ).run();
    await env.DB.prepare(
      "UPDATE principals SET status = 'disabled' WHERE id = 'agt_mail_auth'"
    ).run();
    await expect(
      authenticateAgentBearer(bearerRequest(credential), env as WorkerEnv, {
        resource: "mail",
        allowedScopes: ["mail:read"]
      })
    ).rejects.toBeInstanceOf(AgentBearerError);
  });
});

describe("principal migration safeguards", () => {
  it("keeps a human principal synchronized", async () => {
    await env.DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, role)
       VALUES ('usr_principal_sync', 'Before', 'principal-sync@example.com', 1, ?, ?, 'member')`
    )
      .bind(stamp, stamp)
      .run();
    expect(
      await env.DB.prepare(
        "SELECT type, name, status FROM principals WHERE id = 'usr_principal_sync'"
      ).first()
    ).toEqual({ type: "user", name: "Before", status: "active" });

    await env.DB.prepare(
      `UPDATE "user" SET name = 'After', banned = 1, updatedAt = ? WHERE id = 'usr_principal_sync'`
    )
      .bind("2026-08-23T12:01:00.000Z")
      .run();
    expect(
      await env.DB.prepare(
        "SELECT name, status FROM principals WHERE id = 'usr_principal_sync'"
      ).first()
    ).toEqual({ name: "After", status: "disabled" });
  });

  it("enforces a provisioner's domain and lifetime mailbox limit", async () => {
    await env.DB.batch([
      agentPrincipal("agt_provisioner", "Provisioner"),
      env.DB.prepare(
        `INSERT INTO agents
         (principal_id, profile, created_by_principal_id, mail_domain_id, mailbox_limit,
          created_at, updated_at)
         VALUES ('agt_provisioner', 'provisioner', 'usr_agent_creator', 'dom_agent_auth', 1, ?, ?)`
      ).bind(stamp, stamp),
      agentPrincipal("agt_child_one", "Child One"),
      agentPrincipal("agt_child_two", "Child Two")
    ]);

    await env.DB.prepare(
      `INSERT INTO agents
       (principal_id, profile, created_by_principal_id, mail_domain_id, mailbox_limit,
        created_at, updated_at)
       VALUES ('agt_child_one', 'mailbox', 'agt_provisioner', 'dom_agent_auth', NULL, ?, ?)`
    )
      .bind(stamp, stamp)
      .run();
    await expect(
      env.DB.prepare(
        `INSERT INTO agents
         (principal_id, profile, created_by_principal_id, mail_domain_id, mailbox_limit,
          created_at, updated_at)
         VALUES ('agt_child_two', 'mailbox', 'agt_provisioner', 'dom_agent_auth', NULL, ?, ?)`
      )
        .bind(stamp, stamp)
        .run()
    ).rejects.toThrow("AGENT_MAILBOX_LIMIT_REACHED");
  });
});

function bearerRequest(token: string): Request {
  return new Request(`${origin}/api/v1/messages`, {
    headers: { authorization: `Bearer ${token}` }
  });
}

function agentPrincipal(id: string, name: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO principals (id, type, name, status, created_at, updated_at)
     VALUES (?, 'agent', ?, 'active', ?, ?)`
  ).bind(id, name, stamp, stamp);
}
