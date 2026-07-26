import type { MailboxAccessLevel } from "../../auth/mailbox-access";
import { newId, nowIso } from "../../db/client";
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
    isPrimary: row.is_primary === 1
  };
}

export async function addressMap(
  db: D1Database,
  mailboxIds: string[]
): Promise<Map<string, MailboxAddress[]>> {
  const mapped = new Map<string, MailboxAddress[]>();
  if (mailboxIds.length === 0) return mapped;
  const rows = await db
    .prepare(
      `SELECT id, mailbox_id, mail_domain_id, address, display_name,
     receive_enabled, send_enabled, is_primary
     FROM mailbox_addresses WHERE mailbox_id IN (${mailboxIds.map(() => "?").join(", ")})
     ORDER BY is_primary DESC, address`
    )
    .bind(...mailboxIds)
    .all<MailboxAddressRow>();
  for (const row of rows.results) {
    const addresses = mapped.get(row.mailbox_id) ?? [];
    addresses.push(mapMailboxAddress(row));
    mapped.set(row.mailbox_id, addresses);
  }
  return mapped;
}

export async function listMailboxes(db: D1Database): Promise<Mailbox[]> {
  const result = await db
    .prepare("SELECT * FROM mailboxes ORDER BY is_active DESC, address ASC")
    .all<MailboxRow>();

  const addresses = await addressMap(
    db,
    result.results.map((row) => row.id)
  );
  return result.results.map((row) => mapMailbox(row, addresses.get(row.id)));
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
  const result = await db
    .prepare(
      `SELECT m.*, g.access_level FROM mailboxes m
       LEFT JOIN mailbox_grants g ON g.mailbox_id = m.id AND g.user_id = ?
       WHERE ? = 1 OR g.access_level IS NOT NULL
       ORDER BY m.is_active DESC, m.address ASC`
    )
    .bind(userId, includeWithoutGrant ? 1 : 0)
    .all<MailboxRow & { access_level: MailboxAccessLevel | null }>();
  const addresses = await addressMap(
    db,
    result.results.map((row) => row.id)
  );
  return result.results.map((row) => ({
    ...mapMailbox(row, addresses.get(row.id)),
    accessLevel: row.access_level
  }));
}

export async function countMailboxes(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM mailboxes")
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function findMailboxByAddress(
  db: D1Database,
  address: string
): Promise<Mailbox | null> {
  const row = await db
    .prepare(
      `SELECT m.* FROM mailbox_addresses a
       JOIN mailboxes m ON m.id = a.mailbox_id
       JOIN mail_domains d ON d.id = a.mail_domain_id
       WHERE a.address = ? AND a.receive_enabled = 1 AND d.is_enabled = 1
       UNION SELECT * FROM mailboxes WHERE address = ?
       LIMIT 1`
    )
    .bind(address.toLowerCase(), address.toLowerCase())
    .first<MailboxRow>();

  if (!row) return null;
  const addresses = await addressMap(db, [row.id]);
  return mapMailbox(row, addresses.get(row.id));
}

export async function findMailboxForSending(
  db: D1Database,
  address: string
): Promise<Mailbox | null> {
  const row = await db
    .prepare(
      `SELECT m.* FROM mailbox_addresses a
       JOIN mailboxes m ON m.id = a.mailbox_id
       JOIN mail_domains d ON d.id = a.mail_domain_id
       WHERE a.address = ? AND a.send_enabled = 1 AND d.is_enabled = 1
         AND d.sending_status = 'ready'
       LIMIT 1`
    )
    .bind(address.toLowerCase())
    .first<MailboxRow>();
  if (!row) return null;
  const addresses = await addressMap(db, [row.id]);
  return mapMailbox(row, addresses.get(row.id));
}

export async function findMailboxById(db: D1Database, id: string): Promise<Mailbox | null> {
  const row = await db.prepare("SELECT * FROM mailboxes WHERE id = ?").bind(id).first<MailboxRow>();
  if (!row) return null;
  const addresses = await addressMap(db, [row.id]);
  return mapMailbox(row, addresses.get(row.id));
}

export async function insertMailbox(
  db: D1Database,
  input: CreateMailboxInput,
  mailDomainId: string
): Promise<Mailbox> {
  const timestamp = nowIso();
  const id = newId("mbx");

  const addressId = newId("addr");
  await db.batch([
    db
      .prepare(
        `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`
      )
      .bind(id, input.address, input.displayName, timestamp, timestamp),
    db
      .prepare(
        `INSERT INTO mailbox_addresses
       (id, mailbox_id, mail_domain_id, local_part, address, display_name,
        receive_enabled, send_enabled, is_primary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1, ?, ?)`
      )
      .bind(
        addressId,
        id,
        mailDomainId,
        input.address.split("@")[0],
        input.address,
        input.displayName,
        timestamp,
        timestamp
      )
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
  input: CreateMailboxAddressInput
): Promise<MailboxAddress> {
  const id = newId("addr");
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO mailbox_addresses
     (id, mailbox_id, mail_domain_id, local_part, address, display_name,
      receive_enabled, send_enabled, is_primary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    )
    .bind(
      id,
      mailboxId,
      mailDomainId,
      input.address.split("@")[0],
      input.address,
      input.displayName,
      input.receiveEnabled === false ? 0 : 1,
      input.sendEnabled === false ? 0 : 1,
      timestamp,
      timestamp
    )
    .run();
  return {
    id,
    mailboxId,
    mailDomainId,
    address: input.address,
    displayName: input.displayName,
    receiveEnabled: input.receiveEnabled !== false,
    sendEnabled: input.sendEnabled !== false,
    isPrimary: false
  };
}

export async function deleteMailboxAddress(
  db: D1Database,
  mailboxId: string,
  addressId: string
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM mailbox_addresses WHERE id = ? AND mailbox_id = ? AND is_primary = 0")
    .bind(addressId, mailboxId)
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

  await db
    .prepare(
      `UPDATE mailboxes
       SET display_name = ?, is_active = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(nextDisplayName, nextIsActive ? 1 : 0, timestamp, id)
    .run();

  return {
    ...current,
    displayName: nextDisplayName,
    isActive: nextIsActive,
    updatedAt: timestamp
  };
}
