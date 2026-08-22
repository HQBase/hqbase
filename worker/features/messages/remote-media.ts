import { and, eq } from "drizzle-orm";

import { nowIso } from "../../db/client";
import { createDatabase } from "../../db/drizzle";
import { messageSenderPreferences } from "../../db/schema";

export async function isRemoteMediaTrusted(
  db: D1Database,
  userId: string,
  senderAddress: string
): Promise<boolean> {
  const database = createDatabase(db);
  const row = await database
    .select({ loadRemoteMedia: messageSenderPreferences.loadRemoteMedia })
    .from(messageSenderPreferences)
    .where(
      and(
        eq(messageSenderPreferences.userId, userId),
        eq(messageSenderPreferences.senderAddress, normalizeSenderAddress(senderAddress))
      )
    )
    .get();
  return row?.loadRemoteMedia ?? false;
}

export async function trustRemoteMediaSender(
  db: D1Database,
  userId: string,
  senderAddress: string
): Promise<void> {
  const timestamp = nowIso();
  const database = createDatabase(db);
  await database
    .insert(messageSenderPreferences)
    .values({
      userId,
      senderAddress: normalizeSenderAddress(senderAddress),
      loadRemoteMedia: true,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: [messageSenderPreferences.userId, messageSenderPreferences.senderAddress],
      set: {
        loadRemoteMedia: true,
        updatedAt: timestamp
      }
    })
    .run();
}

function normalizeSenderAddress(value: string): string {
  return value.trim().toLowerCase();
}
