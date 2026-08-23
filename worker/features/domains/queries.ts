import { eq, sql } from "drizzle-orm";

import { newId, nowIso } from "../../db/client";
import { createDatabase, getRow, getRows } from "../../db/drizzle";
import { mailDomains } from "../../db/schema";
import { assertDomainUnusedByLoginEmails } from "../../security/login-email";
import type { CatchAllPolicy, DomainStatus, MailDomain, MailDomainRow } from "./types";

function mapMailDomain(row: MailDomainRow): MailDomain {
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
  const rows = await getRows<MailDomainRow>(
    db,
    sql`SELECT * FROM mail_domains ORDER BY is_enabled DESC, name`
  );
  return rows.map(mapMailDomain);
}

export async function findMailDomainByName(
  db: D1Database,
  name: string
): Promise<MailDomain | null> {
  const row = await getRow<MailDomainRow>(
    db,
    sql`SELECT * FROM mail_domains WHERE name = ${name.toLowerCase()}`
  );
  return row ? mapMailDomain(row) : null;
}

async function findMailDomainById(db: D1Database, id: string): Promise<MailDomain | null> {
  const row = await getRow<MailDomainRow>(db, sql`SELECT * FROM mail_domains WHERE id = ${id}`);
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
  const zoneId = input.zoneId ?? existing?.zoneId ?? null;
  const accountId = input.accountId ?? existing?.accountId ?? null;
  const receivingStatus = input.receivingStatus ?? existing?.receivingStatus ?? "pending";
  const sendingStatus = input.sendingStatus ?? existing?.sendingStatus ?? "pending";
  const dnsStatus = input.dnsStatus ?? existing?.dnsStatus ?? "pending";
  await createDatabase(db)
    .insert(mailDomains)
    .values({
      id,
      name: input.name.toLowerCase(),
      zoneId,
      accountId,
      receivingStatus,
      sendingStatus,
      dnsStatus,
      catchAllPolicy: "reject",
      isEnabled: true,
      verifiedAt: timestamp,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: mailDomains.name,
      set: {
        zoneId,
        accountId,
        receivingStatus,
        sendingStatus,
        dnsStatus,
        isEnabled: true,
        verifiedAt: timestamp,
        updatedAt: timestamp
      }
    })
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
  await createDatabase(db)
    .update(mailDomains)
    .set({
      catchAllPolicy,
      catchAllMailboxId,
      isEnabled: input.isEnabled ?? current.isEnabled,
      updatedAt: nowIso()
    })
    .where(eq(mailDomains.id, id))
    .run();
  return findMailDomainById(db, id);
}
