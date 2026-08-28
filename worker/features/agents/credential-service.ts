import { sql } from "drizzle-orm";

import { createAgentCredential } from "../../auth/agent-credential";
import { newId, nowIso } from "../../db/client";
import { getRow } from "../../db/drizzle";
import { AppError } from "../../lib/errors";
import { type AuditInput, auditStatement } from "../audit/service";

import { findAgentById } from "./queries";
import type {
  Agent,
  AgentCredentialResource,
  AgentMutationResult,
  MailboxAgentAccessLevel
} from "./types";

export async function rotateAgentCredential(
  db: D1Database,
  agentId: string,
  audit: AuditInput
): Promise<AgentMutationResult> {
  const agent = await findAgentById(db, agentId);
  if (!agent) throw new AppError("AGENT_NOT_FOUND", "Agent not found.", 404);
  if (agent.mailbox?.isDeleted) {
    throw new AppError("MAILBOX_DELETED", "Restore the mailbox before creating a credential.", 409);
  }
  if (!agent.isActive) {
    throw new AppError("AGENT_DISABLED", "Enable the agent before creating a credential.", 409);
  }
  const credential = await issueCredential(
    db,
    agent.id,
    credentialResource(agent.profile),
    scopesForAgent(agent),
    audit
  );
  return { agent, credential };
}

export async function rotateProvisionedAgentCredential(
  db: D1Database,
  agentId: string,
  provisionerPrincipalId: string,
  audit: AuditInput
): Promise<AgentMutationResult> {
  const child = await getRow<{ principal_id: string }>(
    db,
    sql`SELECT principal_id
        FROM agents
        WHERE principal_id = ${agentId}
          AND profile = 'mailbox'
          AND created_by_principal_id = ${provisionerPrincipalId}`
  );
  if (!child) {
    throw new AppError(
      "PROVISIONER_CHILD_FORBIDDEN",
      "A provisioner can replace credentials only for mailbox agents that it created.",
      403
    );
  }
  return rotateAgentCredential(db, agentId, audit);
}

export async function setAgentActive(
  db: D1Database,
  agentId: string,
  isActive: boolean,
  audit: AuditInput
): Promise<AgentMutationResult> {
  const current = await findAgentById(db, agentId);
  if (!current) throw new AppError("AGENT_NOT_FOUND", "Agent not found.", 404);
  if (isActive && current.mailbox?.isDeleted) {
    throw new AppError("MAILBOX_DELETED", "Restore the mailbox before enabling its agent.", 409);
  }
  const timestamp = nowIso();
  if (current.isActive === isActive) {
    await db.batch([auditStatement(db, audit, timestamp)]);
    return { agent: current };
  }
  if (!isActive) {
    await db.batch([
      db
        .prepare(
          "UPDATE principals SET status = 'disabled', updated_at = ? WHERE id = ? AND type = 'agent'"
        )
        .bind(timestamp, agentId),
      db
        .prepare("UPDATE agents SET updated_at = ? WHERE principal_id = ?")
        .bind(timestamp, agentId),
      db
        .prepare(
          "UPDATE agent_credentials SET revoked_at = ? WHERE principal_id = ? AND revoked_at IS NULL"
        )
        .bind(timestamp, agentId),
      auditStatement(db, audit, timestamp)
    ]);
    return { agent: await requiredAgent(db, agentId) };
  }

  const resource = credentialResource(current.profile);
  const credentialScopes = scopesForAgent(current);
  const issued = await createAgentCredential();
  try {
    await db.batch([
      db
        .prepare(
          "UPDATE principals SET status = 'active', updated_at = ? WHERE id = ? AND type = 'agent'"
        )
        .bind(timestamp, agentId),
      db
        .prepare("UPDATE agents SET updated_at = ? WHERE principal_id = ?")
        .bind(timestamp, agentId),
      db
        .prepare(
          `UPDATE agent_credentials SET revoked_at = ?
           WHERE principal_id = ? AND resource = ? AND revoked_at IS NULL`
        )
        .bind(timestamp, agentId, resource),
      credentialInsert(db, agentId, issued.secretHash, resource, credentialScopes, timestamp),
      auditStatement(db, audit, timestamp)
    ]);
  } catch (error) {
    throw credentialWriteError(error);
  }
  return { agent: await requiredAgent(db, agentId), credential: issued.token };
}

export function credentialResource(profile: "mailbox" | "provisioner"): AgentCredentialResource {
  return profile === "mailbox" ? "mail" : "management";
}

export function scopesForMailboxAccess(accessLevel: MailboxAgentAccessLevel): string[] {
  return accessLevel === "read" ? ["mail:read"] : ["mail:read", "mail:write", "mail:send"];
}

function scopesForAgent(agent: Agent): string[] {
  return agent.profile === "provisioner"
    ? ["mailbox:provision"]
    : scopesForMailboxAccess(agent.accessLevel ?? "read");
}

async function issueCredential(
  db: D1Database,
  principalId: string,
  resource: AgentCredentialResource,
  scopes: string[],
  audit: AuditInput
): Promise<string> {
  const timestamp = nowIso();
  const issued = await createAgentCredential();
  try {
    await db.batch([
      db
        .prepare(
          `UPDATE agent_credentials SET revoked_at = ?
           WHERE principal_id = ? AND resource = ? AND revoked_at IS NULL`
        )
        .bind(timestamp, principalId, resource),
      credentialInsert(db, principalId, issued.secretHash, resource, scopes, timestamp),
      auditStatement(db, audit, timestamp)
    ]);
  } catch (error) {
    throw credentialWriteError(error);
  }
  return issued.token;
}

function credentialWriteError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("AGENT_MAILBOX_DELETED")) {
    return new AppError(
      "MAILBOX_DELETED",
      "Restore the mailbox before creating a credential.",
      409
    );
  }
  return error instanceof Error ? error : new Error(message);
}

function credentialInsert(
  db: D1Database,
  principalId: string,
  secretHash: string,
  resource: AgentCredentialResource,
  scopes: string[],
  timestamp: string
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO agent_credentials
       (id, principal_id, secret_hash, resource, scopes_json, created_at,
        expires_at, revoked_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`
    )
    .bind(newId("cred"), principalId, secretHash, resource, JSON.stringify(scopes), timestamp);
}

async function requiredAgent(db: D1Database, id: string): Promise<Agent> {
  const agent = await findAgentById(db, id);
  if (!agent) throw new Error("Agent write did not persist.");
  return agent;
}
