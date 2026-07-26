import { AppError } from "../lib/errors";
import type { WorkspaceRole } from "../lib/validation";

export const mailboxAccessLevels = ["read", "agent", "manager"] as const;
export type MailboxAccessLevel = (typeof mailboxAccessLevels)[number];

const rank: Record<MailboxAccessLevel, number> = { read: 1, agent: 2, manager: 3 };

export function accessAllows(
  actual: MailboxAccessLevel | null,
  required: MailboxAccessLevel
): boolean {
  return actual !== null && rank[actual] >= rank[required];
}

export async function mailboxAccess(
  db: D1Database,
  userId: string,
  role: WorkspaceRole,
  mailboxId: string
): Promise<MailboxAccessLevel | null> {
  if (role === "owner") return "manager";
  const row = await db
    .prepare(
      `SELECT g.access_level FROM mailbox_grants g
       JOIN "user" u ON u.id = g.user_id
       WHERE g.mailbox_id = ? AND g.user_id = ? AND COALESCE(u.banned, 0) = 0`
    )
    .bind(mailboxId, userId)
    .first<{ access_level: MailboxAccessLevel }>();
  return row?.access_level ?? null;
}

export async function requireMailboxAccess(
  db: D1Database,
  userId: string,
  role: WorkspaceRole,
  mailboxId: string | null,
  required: MailboxAccessLevel
): Promise<MailboxAccessLevel> {
  const actual = mailboxId ? await mailboxAccess(db, userId, role, mailboxId) : null;
  if (!accessAllows(actual, required)) {
    throw new AppError("MAILBOX_FORBIDDEN", "You do not have access to this mailbox.", 403);
  }
  return actual as MailboxAccessLevel;
}

export async function accessibleMailboxIds(
  db: D1Database,
  userId: string,
  role: WorkspaceRole,
  required: MailboxAccessLevel
): Promise<string[]> {
  if (role === "owner") {
    const result = await db.prepare("SELECT id FROM mailboxes").all<{ id: string }>();
    return result.results.map((row) => row.id);
  }
  const allowed = mailboxAccessLevels.filter((level) => rank[level] >= rank[required]);
  const placeholders = allowed.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT mailbox_id FROM mailbox_grants
       WHERE user_id = ? AND access_level IN (${placeholders})`
    )
    .bind(userId, ...allowed)
    .all<{ mailbox_id: string }>();
  return result.results.map((row) => row.mailbox_id);
}
