import { newId, nowIso } from "../../db/client";
import { assertDomainUnusedByLoginEmails } from "../../security/login-email";
import type { CatchAllPolicy, DomainStatus, MailDomain, MailDomainRow } from "./types";

export function mapMailDomain(row: MailDomainRow): MailDomain {
  return {
    id: row.id,
    name: row.name,
    zoneId: row.zone_id,
    accountId: row.account_id,
    receivingStatus: row.receiving_status,
    sendingStatus: row.sending_status,
    dnsStatus: row.dns_status,
    catchAllPolicy: row.catch_all_policy,
    catchAllMailboxId: row.catch_all_mailbox_id,
    isEnabled: row.is_enabled === 1,
    lastErrorCode: row.last_error_code,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listMailDomains(db: D1Database): Promise<MailDomain[]> {
  const rows = await db
    .prepare("SELECT * FROM mail_domains ORDER BY is_enabled DESC, name")
    .all<MailDomainRow>();
  return rows.results.map(mapMailDomain);
}

export async function findMailDomainByName(
  db: D1Database,
  name: string
): Promise<MailDomain | null> {
  const row = await db
    .prepare("SELECT * FROM mail_domains WHERE name = ?")
    .bind(name.toLowerCase())
    .first<MailDomainRow>();
  return row ? mapMailDomain(row) : null;
}

export async function findMailDomainById(db: D1Database, id: string): Promise<MailDomain | null> {
  const row = await db
    .prepare("SELECT * FROM mail_domains WHERE id = ?")
    .bind(id)
    .first<MailDomainRow>();
  return row ? mapMailDomain(row) : null;
}

export async function upsertMailDomain(
  db: D1Database,
  input: {
    name: string;
    zoneId?: string | null | undefined;
    accountId?: string | null | undefined;
    receivingStatus?: DomainStatus | undefined;
    sendingStatus?: DomainStatus | undefined;
    dnsStatus?: Exclude<DomainStatus, "disabled"> | undefined;
  }
): Promise<MailDomain> {
  const existing = await findMailDomainByName(db, input.name);
  if (!existing) {
    await assertDomainUnusedByLoginEmails(db, input.name);
  }
  const timestamp = nowIso();
  const id = existing?.id ?? newId("dom");
  await db
    .prepare(
      `INSERT INTO mail_domains
     (id, name, zone_id, account_id, receiving_status, sending_status, dns_status,
      catch_all_policy, is_enabled, verified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'reject', 1, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       zone_id = COALESCE(excluded.zone_id, mail_domains.zone_id),
       account_id = COALESCE(excluded.account_id, mail_domains.account_id),
       receiving_status = excluded.receiving_status,
       sending_status = excluded.sending_status,
       dns_status = excluded.dns_status,
       is_enabled = 1,
       verified_at = excluded.verified_at,
       updated_at = excluded.updated_at`
    )
    .bind(
      id,
      input.name.toLowerCase(),
      input.zoneId ?? existing?.zoneId ?? null,
      input.accountId ?? existing?.accountId ?? null,
      input.receivingStatus ?? existing?.receivingStatus ?? "pending",
      input.sendingStatus ?? existing?.sendingStatus ?? "pending",
      input.dnsStatus ?? existing?.dnsStatus ?? "pending",
      timestamp,
      existing?.createdAt ?? timestamp,
      timestamp
    )
    .run();
  const domain = await findMailDomainByName(db, input.name);
  if (!domain) throw new Error("Mail domain upsert did not persist.");
  return domain;
}

export async function updateMailDomainSettings(
  db: D1Database,
  id: string,
  input: {
    catchAllPolicy?: CatchAllPolicy | undefined;
    catchAllMailboxId?: string | null | undefined;
    isEnabled?: boolean | undefined;
  }
): Promise<MailDomain | null> {
  const current = await findMailDomainById(db, id);
  if (!current) return null;
  const catchAllPolicy = input.catchAllPolicy ?? current.catchAllPolicy;
  const catchAllMailboxId =
    catchAllPolicy === "mailbox" ? (input.catchAllMailboxId ?? current.catchAllMailboxId) : null;
  await db
    .prepare(
      `UPDATE mail_domains SET catch_all_policy = ?, catch_all_mailbox_id = ?,
     is_enabled = ?, updated_at = ? WHERE id = ?`
    )
    .bind(
      catchAllPolicy,
      catchAllMailboxId,
      (input.isEnabled ?? current.isEnabled) ? 1 : 0,
      nowIso(),
      id
    )
    .run();
  return findMailDomainById(db, id);
}
