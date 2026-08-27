import { sql } from "drizzle-orm";
import { z } from "zod";

import { getSetting, nowIso } from "../../db/client";
import { getRow } from "../../db/drizzle";
import { AppError } from "../../lib/errors";
import { type AuditInput, auditStatement } from "../audit/service";

import { findMailDomainById } from "./queries";
import type { MailDomain } from "./types";

export async function disconnectMailDomain(
  db: D1Database,
  id: string,
  audit: AuditInput
): Promise<MailDomain> {
  const current = await findMailDomainById(db, id);
  if (!current) throw new AppError("DOMAIN_NOT_FOUND", "Email domain not found.", 404);
  if (current.disconnectedAt) return current;

  const timestamp = nowIso();
  await db.batch([
    db
      .prepare(
        `UPDATE mail_domains
         SET is_enabled = 0,
             receiving_status = 'disabled',
             sending_status = 'disabled',
             catch_all_policy = 'reject',
             catch_all_mailbox_id = NULL,
             disconnected_at = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(timestamp, timestamp, id),
    auditStatement(db, audit, timestamp)
  ]);

  const domain = await findMailDomainById(db, id);
  if (!domain) throw new Error("Disconnected domain state did not persist.");
  return domain;
}

export async function forgetMailDomain(
  db: D1Database,
  id: string,
  confirmation: string,
  audit: AuditInput
): Promise<void> {
  const current = await findMailDomainById(db, id);
  if (!current) throw new AppError("DOMAIN_NOT_FOUND", "Email domain not found.", 404);
  if (confirmation.trim().toLowerCase() !== current.name) {
    throw new AppError("DOMAIN_CONFIRMATION_INVALID", "Enter the exact domain name.", 400);
  }
  if (!current.disconnectedAt) {
    throw new AppError(
      "DOMAIN_DISCONNECT_REQUIRED",
      "Disconnect this domain before forgetting it.",
      409
    );
  }

  const blockers = await getRow<{ count: number }>(
    db,
    sql`SELECT
          (SELECT COUNT(*) FROM mailboxes WHERE mail_domain_id = ${id}) +
          (SELECT COUNT(*) FROM agents WHERE mail_domain_id = ${id}) +
          (SELECT COUNT(*) FROM email_signatures WHERE mail_domain_id = ${id}) +
          (SELECT COUNT(*) FROM messages
             WHERE (delivered_to_address IS NOT NULL
                    AND lower(substr(delivered_to_address, instr(delivered_to_address, '@') + 1)) = ${current.name})
                OR (is_unassigned = 1 AND delivered_to_address IS NULL))
          AS count`
  );
  if ((blockers?.count ?? 0) > 0) {
    throw new AppError(
      "DOMAIN_NOT_EMPTY",
      "Remove this domain's mailboxes, agents, signatures, and stored mail before forgetting it.",
      409
    );
  }

  const other = await getRow<{ name: string; disconnected_at: string | null }>(
    db,
    sql`SELECT name, disconnected_at FROM mail_domains
        WHERE id <> ${id}
        ORDER BY disconnected_at IS NOT NULL, is_enabled DESC, created_at, name
        LIMIT 1`
  );
  if (!other) {
    throw new AppError(
      "DOMAIN_LAST_REQUIRED",
      "Connect another domain before forgetting the last workspace domain.",
      409
    );
  }

  const primaryDomain = await getSetting(db, "primary_domain", z.string());
  const timestamp = nowIso();
  const deletion = db.prepare("DELETE FROM mail_domains WHERE id = ?").bind(id);
  const auditWrite = auditStatement(db, audit, timestamp);
  if (primaryDomain === current.name) {
    if (other.disconnected_at) {
      throw new AppError(
        "DOMAIN_PRIMARY_REPLACEMENT_REQUIRED",
        "Reconnect another domain before forgetting the primary domain.",
        409
      );
    }
    await db.batch([
      db
        .prepare(
          `INSERT INTO app_settings (key, value_json, created_at, updated_at)
           VALUES ('primary_domain', ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
                                             updated_at = excluded.updated_at`
        )
        .bind(JSON.stringify(other.name), timestamp, timestamp),
      deletion,
      auditWrite
    ]);
    return;
  }

  await db.batch([deletion, auditWrite]);
}
