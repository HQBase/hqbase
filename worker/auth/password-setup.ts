import { and, eq, like } from "drizzle-orm";

import { createDatabase } from "../db/drizzle";
import { userOnboarding, verifications } from "../db/schema";

export async function isPasswordSetupRequired(db: D1Database, userId: string): Promise<boolean> {
  const database = createDatabase(db);
  const row = await database
    .select({ status: userOnboarding.status })
    .from(userOnboarding)
    .where(eq(userOnboarding.userId, userId))
    .get();
  return row?.status === "pending";
}

export async function completePasswordSetup(db: D1Database, userId: string): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const database = createDatabase(db);
  const results = await database.batch([
    database
      .update(userOnboarding)
      .set({ status: "complete", completedAt: timestamp, updatedAt: timestamp })
      .where(and(eq(userOnboarding.userId, userId), eq(userOnboarding.status, "pending"))),
    database
      .delete(verifications)
      .where(
        and(eq(verifications.value, userId), like(verifications.identifier, "reset-password:%"))
      )
  ]);
  return (results[0]?.meta.changes ?? 0) > 0;
}
