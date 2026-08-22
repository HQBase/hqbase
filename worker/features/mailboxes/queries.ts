import { and, eq, sql } from "drizzle-orm";

import type { MailboxAccessLevel } from "../../auth/mailbox-access";
import { newId, nowIso } from "../../db/client";
import { createDatabase, getRow, getRows } from "../../db/drizzle";
import { mailboxAddresses, mailboxes } from "../../db/schema";
import type { WorkspaceRole } from "../../lib/validation";

import type {
  CreateMailboxAddressInput,
  CreateMailboxInput,
  Mailbox,
  MailboxAddress,
  MailboxAddressRow,
  MailboxRow,
  UpdateMailboxInput
} from "./types";

export function mapMailbox(row: MailboxRow, addresses: MailboxAddress[] = []): Mailbox {
  return {
    id: row.id,
    address: row.address,
    addresses,
    displayName: row.display_name,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapMailboxAddress(row: MailboxAddressRow): MailboxAddress {
  return {
    id: row.id,
    mailboxId: row.mailbox_id,
    mailDomainId: row.mail_domain_id,
    address: row.address,
    displayName: row.display_name,
    receiveEnabled: row.receive_enabled === 1,
    sendEnabled: row.send_enabled === 1,
    sendAvailable: row.send_enabled === 1 && row.sending_status === "ready",
    isPrimary: row.is_primary === 1
  };
}

export async function addressMap(
  db: D1Database,
  mailboxIds: string[]
): Promise<Map<string, MailboxAddress[]>> {
  const mapped = new Map<string, MailboxAddress[]>();
  if (mailboxIds.length === 0) return mapped;
  const rows = await getRows<MailboxAddressRow>(
    db,
    sql`SELECT a.id, a.mailbox_id, a.mail_domain_id, a.address, a.display_name,
     a.receive_enabled, a.send_enabled, a.is_primary, d.sending_status
     FROM mailbox_addresses a
     JOIN mail_domains d ON d.id = a.mail_domain_id
     WHERE mailbox_id IN (${sql.join(
       mailboxIds.map((mailboxId) => sql`${mailboxId}`),
       sql`, `
     )})
     ORDER BY is_primary DESC, address`
  );
  for (const row of rows) {
    const addresses = mapped.get(row.mailbox_id) ?? [];
    addresses.push(mapMailboxAddress(row));
    mapped.set(row.mailbox_id, addresses);
  }
  return mapped;
}

export async function listMailboxes(db: D1Database): Promise<Mailbox[]> {
  const rows = await getRows<MailboxRow>(
    db,
    sql`SELECT * FROM mailboxes ORDER BY is_active DESC, address ASC`
  );

  const addresses = await addressMap(
    db,
    rows.map((row) => row.id)
  );
  return rows.map((row) => mapMailbox(row, addresses.get(row.id)));
}

export async function listMailboxesForUser(
  db: D1Database,
  userId: string,
  role: WorkspaceRole
): Promise<Array<Mailbox & { accessLevel: MailboxAccessLevel | null }>> {
  if (role === "owner") {
    return (await listMailboxes(db)).map((mailbox) => ({ ...mailbox, accessLevel: "manager" }));
  }
  const includeWithoutGrant = role === "admin";
  const rows = await getRows<MailboxRow & { access_level: MailboxAccessLevel | null }>(
    db,
    sql`SELECT m.*, g.access_level FROM mailboxes m
       LEFT JOIN mailbox_grants g ON g.mailbox_id = m.id AND g.user_id = ${userId}
       WHERE ${includeWithoutGrant ? 1 : 0} = 1 OR g.access_level IS NOT NULL
       ORDER BY m.is_active DESC, m.address ASC`
  );
  const addresses = await addressMap(
    db,
    rows.map((row) => row.id)
  );
  return rows.map((row) => ({
    ...mapMailbox(row, addresses.get(row.id)),
    accessLevel: row.access_level
  }));
}

export async function countMailboxes(db: D1Database): Promise<number> {
  const row = await getRow<{ count: number }>(db, sql`SELECT COUNT(*) AS count FROM mailboxes`);
  return row?.count ?? 0;
}

export async function findMailboxByAddress(
  db: D1Database,
  address: string
): Promise<Mailbox | null> {
  const normalized = address.toLowerCase();
  const row = await getRow<MailboxRow>(
    db,
    sql`SELECT m.* FROM mailbox_addresses a
       JOIN mailboxes m ON m.id = a.mailbox_id
       JOIN mail_domains d ON d.id = a.mail_domain_id
       WHERE a.address = ${normalized} AND a.receive_enabled = 1 AND d.is_enabled = 1
       UNION SELECT * FROM mailboxes WHERE address = ${normalized}
       LIMIT 1`
  );

  if (!row) return null;
  const addresses = await addressMap(db, [row.id]);
  return mapMailbox(row, addresses.get(row.id));
}

export async function findMailboxForSending(
  db: D1Database,
  address: string
): Promise<Mailbox | null> {
  const row = await getRow<MailboxRow>(
    db,
    sql`SELECT m.* FROM mailbox_addresses a
       JOIN mailboxes m ON m.id = a.mailbox_id
       JOIN mail_domains d ON d.id = a.mail_domain_id
       WHERE a.address = ${address.toLowerCase()} AND a.send_enabled = 1 AND d.is_enabled = 1
         AND d.sending_status = 'ready'
       LIMIT 1`
  );
  if (!row) return null;
  const addresses = await addressMap(db, [row.id]);
  return mapMailbox(row, addresses.get(row.id));
}

export async function findMailboxById(db: D1Database, id: string): Promise<Mailbox | null> {
  const row = await getRow<MailboxRow>(db, sql`SELECT * FROM mailboxes WHERE id = ${id}`);
  if (!row) return null;
  const addresses = await addressMap(db, [row.id]);
  return mapMailbox(row, addresses.get(row.id));
}

export async function insertMailbox(
  db: D1Database,
  input: CreateMailboxInput,
  mailDomainId: string,
  sendingReady: boolean
): Promise<Mailbox> {
  const timestamp = nowIso();
  const id = newId("mbx");

  const addressId = newId("addr");
  const database = createDatabase(db);
  await database.batch([
    database.insert(mailboxes).values({
      id,
      address: input.address,
      displayName: input.displayName,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp
    }),
    database.insert(mailboxAddresses).values({
      id: addressId,
      mailboxId: id,
      mailDomainId,
      localPart: input.address.split("@")[0] ?? input.address,
      address: input.address,
      displayName: input.displayName,
      receiveEnabled: true,
      sendEnabled: true,
      isPrimary: true,
      createdAt: timestamp,
      updatedAt: timestamp
    })
  ]);

  return {
    id,
    address: input.address,
    addresses: [
      {
        id: addressId,
        mailboxId: id,
        mailDomainId,
        address: input.address,
        displayName: input.displayName,
        receiveEnabled: true,
        sendEnabled: true,
        sendAvailable: sendingReady,
        isPrimary: true
      }
    ],
    displayName: input.displayName,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export async function insertMailboxAddress(
  db: D1Database,
  mailboxId: string,
  mailDomainId: string,
  input: CreateMailboxAddressInput,
  sendingReady: boolean
): Promise<MailboxAddress> {
  const id = newId("addr");
  const timestamp = nowIso();
  await createDatabase(db)
    .insert(mailboxAddresses)
    .values({
      id,
      mailboxId,
      mailDomainId,
      localPart: input.address.split("@")[0] ?? input.address,
      address: input.address,
      displayName: input.displayName,
      receiveEnabled: input.receiveEnabled !== false,
      sendEnabled: input.sendEnabled !== false,
      isPrimary: false,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .run();
  return {
    id,
    mailboxId,
    mailDomainId,
    address: input.address,
    displayName: input.displayName,
    receiveEnabled: input.receiveEnabled !== false,
    sendEnabled: input.sendEnabled !== false,
    sendAvailable: input.sendEnabled !== false && sendingReady,
    isPrimary: false
  };
}

export async function deleteMailboxAddress(
  db: D1Database,
  mailboxId: string,
  addressId: string
): Promise<boolean> {
  const result = await createDatabase(db)
    .delete(mailboxAddresses)
    .where(
      and(
        eq(mailboxAddresses.id, addressId),
        eq(mailboxAddresses.mailboxId, mailboxId),
        eq(mailboxAddresses.isPrimary, false)
      )
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function updateMailbox(
  db: D1Database,
  id: string,
  input: UpdateMailboxInput
): Promise<Mailbox | null> {
  const current = await findMailboxById(db, id);
  if (!current) {
    return null;
  }

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
