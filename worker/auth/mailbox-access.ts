import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { createDatabase, getRow } from "../db/drizzle";
import { mailboxes, mailboxGrants } from "../db/schema";
import { AppError } from "../lib/errors";
import type { WorkspaceRole } from "../lib/validation";

export const mailboxAccessLevels = ["read", "agent", "manager"] as const;
export type MailboxAccessLevel = (typeof mailboxAccessLevels)[number];

const rank: Record<MailboxAccessLevel, number> = { read: 1, agent: 2, manager: 3 };

/** Unassigned messages have no mailbox grant, so only workspace owners can access them. */
export function canAccessUnassignedMail(role: WorkspaceRole | null): boolean {
  return role === "owner";
}

export type MessageScope = {
  includeUnassigned: boolean;
  mailboxIds: string[];
};

/**
 * Builds one message-visibility predicate for mailbox grants and owner-only unassigned mail.
 * The stored marker is separate from `mailbox_id` because historical hard deletion can set that
 * column to null. Returns null when the scope selects nothing.
 */
export function messageScopeSql(
  scope: MessageScope,
  mailboxColumn: string,
  unassignedColumn: string
): { params: string[]; sql: string } | null {
  const clauses: string[] = [];
  if (scope.mailboxIds.length > 0) {
    clauses.push(`${mailboxColumn} IN (SELECT value FROM json_each(?))`);
  }
  if (scope.includeUnassigned) {
    clauses.push(`${unassignedColumn} = 1`);
  }
  if (clauses.length === 0) return null;
  return {
    params: scope.mailboxIds.length ? [JSON.stringify(scope.mailboxIds)] : [],
    sql: `(${clauses.join(" OR ")})`
  };
}

export function messageScopeCondition(
  scope: MessageScope,
  mailboxColumn: string,
  unassignedColumn: string
) {
  const clauses = [];
  if (scope.mailboxIds.length > 0) {
    clauses.push(
      sql`${sql.raw(mailboxColumn)} IN (SELECT value FROM json_each(${JSON.stringify(scope.mailboxIds)}))`
    );
  }
  if (scope.includeUnassigned) {
    clauses.push(sql`${sql.raw(unassignedColumn)} = 1`);
  }
  return clauses.length > 0 ? sql`(${sql.join(clauses, sql` OR `)})` : null;
}

export function accessAllows(
  actual: MailboxAccessLevel | null,
  required: MailboxAccessLevel
): boolean {
  return actual !== null && rank[actual] >= rank[required];
}

export async function mailboxAccess(
  db: D1Database,
  principalId: string,
  role: WorkspaceRole | null,
  mailboxId: string
): Promise<MailboxAccessLevel | null> {
  if (role === "owner") {
    const mailbox = await getRow<{ id: string }>(
      db,
      sql`SELECT id FROM mailboxes WHERE id = ${mailboxId} AND deleted_at IS NULL`
    );
    return mailbox ? "manager" : null;
  }
  const row = await getRow<{ access_level: MailboxAccessLevel }>(
    db,
    sql`SELECT g.access_level FROM mailbox_grants g
       JOIN principals p ON p.id = g.principal_id
       JOIN mailboxes m ON m.id = g.mailbox_id AND m.deleted_at IS NULL
       WHERE g.mailbox_id = ${mailboxId}
         AND g.principal_id = ${principalId}
         AND p.status = 'active'`
  );
  return row?.access_level ?? null;
}

export async function requireMailboxAccess(
  db: D1Database,
  principalId: string,
  role: WorkspaceRole | null,
  mailboxId: string,
  required: MailboxAccessLevel
): Promise<MailboxAccessLevel> {
  const actual = await mailboxAccess(db, principalId, role, mailboxId);
  if (!accessAllows(actual, required)) {
    throw new AppError("MAILBOX_FORBIDDEN", "You do not have access to this mailbox.", 403);
  }
  return actual as MailboxAccessLevel;
}

export async function accessibleMailboxIds(
  db: D1Database,
  principalId: string,
  role: WorkspaceRole | null,
  required: MailboxAccessLevel
): Promise<string[]> {
  const database = createDatabase(db);
  if (role === "owner") {
    const rows = await database
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(isNull(mailboxes.deletedAt));
    return rows.map((row) => row.id);
  }
  const allowed = mailboxAccessLevels.filter((level) => rank[level] >= rank[required]);
  const rows = await database
    .select({ mailboxId: mailboxGrants.mailboxId })
    .from(mailboxGrants)
    .innerJoin(mailboxes, eq(mailboxes.id, mailboxGrants.mailboxId))
    .where(
      and(
        eq(mailboxGrants.principalId, principalId),
        inArray(mailboxGrants.accessLevel, allowed),
        isNull(mailboxes.deletedAt)
      )
    );
  return rows.map((row) => row.mailboxId);
}

export async function accessibleMessageScope(
  db: D1Database,
  principalId: string,
  role: WorkspaceRole | null,
  required: MailboxAccessLevel
): Promise<MessageScope> {
  return {
    includeUnassigned: canAccessUnassignedMail(role),
    mailboxIds: await accessibleMailboxIds(db, principalId, role, required)
  };
}
