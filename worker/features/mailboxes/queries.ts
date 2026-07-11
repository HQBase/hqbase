import type { MailboxAccessLevel } from "../../auth/mailbox-access";
import { newId, nowIso } from "../../db/client";
import type { WorkspaceRole } from "../../lib/validation";

import type { CreateMailboxInput, Mailbox, MailboxRow, UpdateMailboxInput } from "./types";

export function mapMailbox(row: MailboxRow): Mailbox {
  return {
    id: row.id,
    address: row.address,
    displayName: row.display_name,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listMailboxes(db: D1Database): Promise<Mailbox[]> {
  const result = await db
    .prepare("SELECT * FROM mailboxes ORDER BY is_active DESC, address ASC")
    .all<MailboxRow>();

  return result.results.map(mapMailbox);
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
       LEFT JOIN pro_mailbox_grants g ON g.mailbox_id = m.id AND g.user_id = ?
       WHERE ? = 1 OR g.access_level IS NOT NULL
       ORDER BY m.is_active DESC, m.address ASC`
    )
    .bind(userId, includeWithoutGrant ? 1 : 0)
    .all<MailboxRow & { access_level: MailboxAccessLevel | null }>();
  return result.results.map((row) => ({ ...mapMailbox(row), accessLevel: row.access_level }));
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
    .prepare("SELECT * FROM mailboxes WHERE address = ?")
    .bind(address)
    .first<MailboxRow>();

  return row ? mapMailbox(row) : null;
}

export async function findMailboxById(db: D1Database, id: string): Promise<Mailbox | null> {
  const row = await db.prepare("SELECT * FROM mailboxes WHERE id = ?").bind(id).first<MailboxRow>();
  return row ? mapMailbox(row) : null;
}

export async function insertMailbox(db: D1Database, input: CreateMailboxInput): Promise<Mailbox> {
  const timestamp = nowIso();
  const id = newId("mbx");

  await db
    .prepare(
      `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`
    )
    .bind(id, input.address, input.displayName, timestamp, timestamp)
    .run();

  return {
    id,
    address: input.address,
    displayName: input.displayName,
    isActive: true,
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
