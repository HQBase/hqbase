import { sql } from "drizzle-orm";

import { nowIso } from "../../db/client";
import { getRow } from "../../db/drizzle";
import { AppError } from "../../lib/errors";
import { findAgentById } from "../agents/queries";
import type { Agent } from "../agents/types";
import { type AuditInput, auditStatement } from "../audit/service";

import { findMailboxById } from "./queries";
import type { Mailbox } from "./types";

export async function softDeleteMailbox(
  db: D1Database,
  mailboxId: string,
  audit: AuditInput
): Promise<Mailbox> {
  const mailbox = await findMailboxById(db, mailboxId);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Mailbox not found.", 404);

  const occurredAt = nowIso();
  const timestamp = mailbox.deletedAt ?? occurredAt;
  await db.batch([
    db
      .prepare("UPDATE mailboxes SET deleted_at = ?, updated_at = ? WHERE id = ?")
      .bind(timestamp, timestamp, mailboxId),
    db
      .prepare(
        `UPDATE principals
         SET status = 'disabled', updated_at = ?
         WHERE type = 'agent' AND id IN (
           SELECT principal_id FROM mailbox_grants WHERE mailbox_id = ?
         )`
      )
      .bind(timestamp, mailboxId),
    db
      .prepare(
        `UPDATE agents SET updated_at = ?
         WHERE principal_id IN (
           SELECT principal_id FROM mailbox_grants WHERE mailbox_id = ?
         )`
      )
      .bind(timestamp, mailboxId),
    db
      .prepare(
        `UPDATE agent_credentials SET revoked_at = ?
         WHERE revoked_at IS NULL AND principal_id IN (
           SELECT principal_id FROM mailbox_grants WHERE mailbox_id = ?
         )`
      )
      .bind(timestamp, mailboxId),
    auditStatement(db, audit, occurredAt)
  ]);

  return requiredMailbox(db, mailboxId);
}

export async function restoreMailbox(
  db: D1Database,
  mailboxId: string,
  audit: AuditInput
): Promise<Mailbox> {
  const mailbox = await findMailboxById(db, mailboxId);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Mailbox not found.", 404);
  if (!mailbox.deletedAt) return mailbox;

  const timestamp = nowIso();
  await db.batch([
    db
      .prepare("UPDATE mailboxes SET deleted_at = NULL, updated_at = ? WHERE id = ?")
      .bind(timestamp, mailboxId),
    auditStatement(db, audit, timestamp)
  ]);
  return requiredMailbox(db, mailboxId);
}

export async function deprovisionAgentMailbox(
  db: D1Database,
  agentId: string,
  provisionerId: string,
  audit: AuditInput
): Promise<Agent> {
  const child = await getRow<{ mailbox_id: string }>(
    db,
    sql`SELECT grant_row.mailbox_id
        FROM agents child
        JOIN mailbox_grants grant_row
          ON grant_row.principal_id = child.principal_id
         AND grant_row.created_by_principal_id = child.created_by_principal_id
        JOIN mailboxes mailbox
          ON mailbox.id = grant_row.mailbox_id
         AND mailbox.kind = 'agent'
         AND mailbox.created_at = child.created_at
        WHERE child.principal_id = ${agentId}
          AND child.profile = 'mailbox'
          AND child.created_by_principal_id = ${provisionerId}
        LIMIT 1`
  );
  if (!child) {
    throw new AppError(
      "PROVISIONER_CHILD_FORBIDDEN",
      "A provisioner can deprovision only a dedicated mailbox agent that it created.",
      403
    );
  }

  await softDeleteMailbox(db, child.mailbox_id, audit);
  const agent = await findAgentById(db, agentId);
  if (!agent) throw new Error("Deprovisioned agent was not found.");
  return agent;
}

async function requiredMailbox(db: D1Database, mailboxId: string): Promise<Mailbox> {
  const mailbox = await findMailboxById(db, mailboxId);
  if (!mailbox) throw new Error("Mailbox lifecycle write did not persist.");
  return mailbox;
}
