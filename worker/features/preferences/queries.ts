import { eq } from "drizzle-orm";

import { nowIso } from "../../db/client";
import { createDatabase } from "../../db/drizzle";
import { userMailPreferences } from "../../db/schema";

export async function getDefaultFromMailboxId(
  db: D1Database,
  userId: string
): Promise<string | null> {
  const database = createDatabase(db);
  const row = await database
    .select({ defaultFromMailboxId: userMailPreferences.defaultFromMailboxId })
    .from(userMailPreferences)
    .where(eq(userMailPreferences.userId, userId))
    .get();
  return row?.defaultFromMailboxId ?? null;
}

export async function setDefaultFromMailboxId(
  db: D1Database,
  userId: string,
  mailboxId: string
): Promise<void> {
  const timestamp = nowIso();
  const database = createDatabase(db);
  await database
    .insert(userMailPreferences)
    .values({
      userId,
      defaultFromMailboxId: mailboxId,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: userMailPreferences.userId,
      set: {
        defaultFromMailboxId: mailboxId,
        updatedAt: timestamp
      }
    })
    .run();
}
