import { and, asc, eq } from "drizzle-orm";

import type { MailboxAccessLevel } from "../../auth/mailbox-access";
import { nowIso } from "../../db/client";
import { createDatabase } from "../../db/drizzle";
import { mailboxGrants, principals } from "../../db/schema";

export type MailboxGrant = {
  mailboxId: string;
  userId: string;
  accessLevel: MailboxAccessLevel;
  createdAt: string;
  updatedAt: string;
};

export async function listMailboxGrants(db: D1Database): Promise<MailboxGrant[]> {
  return createDatabase(db)
    .select({
      mailboxId: mailboxGrants.mailboxId,
      userId: mailboxGrants.principalId,
      accessLevel: mailboxGrants.accessLevel,
      createdAt: mailboxGrants.createdAt,
      updatedAt: mailboxGrants.updatedAt
    })
    .from(mailboxGrants)
    .innerJoin(principals, eq(principals.id, mailboxGrants.principalId))
    .where(eq(principals.type, "user"))
    .orderBy(asc(mailboxGrants.mailboxId), asc(mailboxGrants.principalId));
}

export async function setMailboxGrant(
  db: D1Database,
  mailboxId: string,
  userId: string,
  accessLevel: MailboxAccessLevel,
  actorId: string
): Promise<void> {
  const timestamp = nowIso();
  await createDatabase(db)
    .insert(mailboxGrants)
    .values({
      mailboxId,
      principalId: userId,
      accessLevel,
      createdByPrincipalId: actorId,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: [mailboxGrants.mailboxId, mailboxGrants.principalId],
      set: { accessLevel, createdByPrincipalId: actorId, updatedAt: timestamp }
    })
    .run();
}

export async function revokeMailboxGrant(
  db: D1Database,
  mailboxId: string,
  userId: string
): Promise<boolean> {
  const result = await createDatabase(db)
    .delete(mailboxGrants)
    .where(and(eq(mailboxGrants.mailboxId, mailboxId), eq(mailboxGrants.principalId, userId)))
    .run();
  return (result.meta.changes ?? 0) > 0;
}
