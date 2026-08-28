import { eq, sql } from "drizzle-orm";

import type { MailboxAccessLevel } from "../../auth/mailbox-access";
import { newId, nowIso } from "../../db/client";
import { createDatabase, getRow, getRows } from "../../db/drizzle";
import { mailboxes } from "../../db/schema";
import type { WorkspaceRole } from "../../lib/validation";

import type { CreateMailboxInput, Mailbox, MailboxRow, UpdateMailboxInput } from "./types";

export function mapMailbox(row: MailboxRow): Mailbox {
  return {
    id: row.id,
    address: row.address,
    mailDomainId: row.mail_domain_id,
    displayName: row.display_name,
    kind: row.kind,
    isActive: row.is_active === 1,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listMailboxes(db: D1Database): Promise<Mailbox[]> {
  const rows = await getRows<MailboxRow>(
    db,
    sql`SELECT * FROM mailboxes
        WHERE deleted_at IS NULL
        ORDER BY is_active DESC, address ASC`
  );
  return rows.map(mapMailbox);
}

export async function listMailboxesForUser(
  db: D1Database,
  principalId: string,
  role: WorkspaceRole | null
): Promise<Array<Mailbox & { accessLevel: MailboxAccessLevel | null }>> {
  if (role === "owner") {
    return (await listMailboxes(db)).map((mailbox) => ({ ...mailbox, accessLevel: "manager" }));
  }
  const includeWithoutGrant = role === "admin";
  const rows = await getRows<MailboxRow & { access_level: MailboxAccessLevel | null }>(
    db,
    sql`SELECT m.*, g.access_level FROM mailboxes m
       LEFT JOIN mailbox_grants g ON g.mailbox_id = m.id AND g.principal_id = ${principalId}
       WHERE m.deleted_at IS NULL
         AND (${includeWithoutGrant ? 1 : 0} = 1 OR g.access_level IS NOT NULL)
       ORDER BY m.is_active DESC, m.address ASC`
  );
  return rows.map((row) => ({ ...mapMailbox(row), accessLevel: row.access_level }));
}

export async function listDeletedMailboxes(db: D1Database): Promise<Mailbox[]> {
  const rows = await getRows<MailboxRow>(
    db,
    sql`SELECT * FROM mailboxes
        WHERE deleted_at IS NOT NULL
        ORDER BY deleted_at DESC, address ASC`
  );
  return rows.map(mapMailbox);
}

export async function countMailboxes(db: D1Database): Promise<number> {
  const row = await getRow<{ count: number }>(
    db,
    sql`SELECT COUNT(*) AS count FROM mailboxes WHERE deleted_at IS NULL`
  );
  return row?.count ?? 0;
}

export async function findMailboxForReceiving(
  db: D1Database,
  address: string
): Promise<Mailbox | null> {
  const row = await getRow<MailboxRow>(
    db,
    sql`SELECT m.* FROM mailboxes m
       JOIN mail_domains d ON d.id = m.mail_domain_id
       WHERE m.address = ${address.toLowerCase()}
         AND m.deleted_at IS NULL
         AND m.is_active = 1
         AND d.is_enabled = 1
         AND d.receiving_status = 'ready'
       LIMIT 1`
  );
  return row ? mapMailbox(row) : null;
}

export async function findMailboxForCatchAllReceiving(
  db: D1Database,
  id: string,
  mailDomainId: string
): Promise<Mailbox | null> {
  const row = await getRow<MailboxRow>(
    db,
    sql`SELECT m.* FROM mailboxes m
        JOIN mail_domains d ON d.id = m.mail_domain_id
        WHERE m.id = ${id}
          AND m.mail_domain_id = ${mailDomainId}
          AND m.kind = 'human'
          AND m.deleted_at IS NULL
          AND m.is_active = 1
          AND d.is_enabled = 1
          AND d.receiving_status = 'ready'
        LIMIT 1`
  );
  return row ? mapMailbox(row) : null;
}

export async function findCatchAllDomainForMailbox(
  db: D1Database,
  mailboxId: string
): Promise<string | null> {
  const row = await getRow<{ name: string }>(
    db,
    sql`SELECT name FROM mail_domains
        WHERE catch_all_policy = 'mailbox' AND catch_all_mailbox_id = ${mailboxId}
        LIMIT 1`
  );
  return row?.name ?? null;
}

export async function findMailboxForSending(
  db: D1Database,
  address: string
): Promise<Mailbox | null> {
  const row = await getRow<MailboxRow>(
    db,
    sql`SELECT m.* FROM mailboxes m
       JOIN mail_domains d ON d.id = m.mail_domain_id
       WHERE m.address = ${address.toLowerCase()}
         AND m.deleted_at IS NULL
         AND d.is_enabled = 1
         AND d.sending_status = 'ready'
       LIMIT 1`
  );
  return row ? mapMailbox(row) : null;
}

export async function findMailboxById(db: D1Database, id: string): Promise<Mailbox | null> {
  const row = await getRow<MailboxRow>(db, sql`SELECT * FROM mailboxes WHERE id = ${id}`);
  return row ? mapMailbox(row) : null;
}

export async function insertMailbox(
  db: D1Database,
  input: CreateMailboxInput,
  mailDomainId: string
): Promise<Mailbox | null> {
  const timestamp = nowIso();
  const id = newId("mbx");
  const result = await createDatabase(db)
    .insert(mailboxes)
    .values({
      id,
      address: input.address,
      mailDomainId,
      displayName: input.displayName,
      kind: "human",
      isActive: true,
      deletedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoNothing({ target: mailboxes.address })
    .run();
  if ((result.meta.changes ?? 0) === 0) return null;
  return {
    id,
    address: input.address,
    mailDomainId,
    displayName: input.displayName,
    kind: "human",
    isActive: true,
    deletedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export async function updateMailbox(
  db: D1Database,
  id: string,
  input: UpdateMailboxInput
): Promise<Mailbox | null> {
  const current = await findMailboxById(db, id);
  if (!current) return null;

  const nextDisplayName = input.displayName ?? current.displayName;
  const nextIsActive = input.isActive ?? current.isActive;
  const timestamp = nowIso();
  await createDatabase(db)
    .update(mailboxes)
    .set({ displayName: nextDisplayName, isActive: nextIsActive, updatedAt: timestamp })
    .where(eq(mailboxes.id, id))
    .run();
  return {
    ...current,
    displayName: nextDisplayName,
    isActive: nextIsActive,
    updatedAt: timestamp
  };
}
