import { sql } from "drizzle-orm";

import { getRows } from "../../db/drizzle";
import type { WorkerEnv } from "../../lib/env";

import type { StoredOutgoingAttachment } from "./content-attachments";

export async function stageOutgoingAttachments(
  bucket: R2Bucket,
  attachments: StoredOutgoingAttachment[]
): Promise<void> {
  try {
    for (const attachment of attachments) {
      await bucket.put(attachment.r2Key, attachment.content, {
        httpMetadata: { contentType: attachment.contentType }
      });
    }
  } catch (error) {
    await cleanupStagedObjects(bucket, attachments);
    throw error;
  }
}

export async function sendWithStagedCleanup(
  env: Pick<WorkerEnv, "MAIL_OBJECTS" | "MAIL_SENDER">,
  email: Parameters<SendEmail["send"]>[0],
  stagedAttachments: StoredOutgoingAttachment[]
): Promise<Awaited<ReturnType<SendEmail["send"]>>> {
  try {
    return await env.MAIL_SENDER.send(email);
  } catch (error) {
    await cleanupStagedObjects(env.MAIL_OBJECTS, stagedAttachments);
    throw error;
  }
}

async function cleanupStagedObjects(
  bucket: R2Bucket,
  attachments: StoredOutgoingAttachment[]
): Promise<void> {
  await deleteObjectKeys(
    bucket,
    attachments.map((attachment) => attachment.r2Key)
  );
}

export async function cleanupUnstoredObjects(
  env: Pick<WorkerEnv, "DB" | "MAIL_OBJECTS">,
  attachments: StoredOutgoingAttachment[]
): Promise<void> {
  await cleanupUnstoredObjectKeys(
    env,
    attachments.map((attachment) => attachment.r2Key)
  );
}

export async function cleanupUnstoredObjectKeys(
  env: Pick<WorkerEnv, "DB" | "MAIL_OBJECTS">,
  keys: string[]
): Promise<void> {
  const uniqueKeys = [...new Set(keys)];
  if (uniqueKeys.length === 0) return;
  try {
    const values = sql.join(
      uniqueKeys.map((key) => sql`${key}`),
      sql`, `
    );
    const referenced = await getRows<{ r2_key: string }>(
      env.DB,
      sql`SELECT r2_key FROM message_attachments WHERE r2_key IN (${values})
          UNION
          SELECT html_r2_key AS r2_key FROM messages WHERE html_r2_key IN (${values})
          UNION
          SELECT raw_r2_key AS r2_key FROM messages WHERE raw_r2_key IN (${values})`
    );
    const referencedKeys = new Set(referenced.map((object) => object.r2_key));
    await deleteObjectKeys(
      env.MAIL_OBJECTS,
      uniqueKeys.filter((key) => !referencedKeys.has(key))
    );
  } catch {
    // Keep objects when D1 cannot prove that they are unreferenced.
  }
}

export async function deleteObjectKeys(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (let start = 0; start < keys.length; start += 1_000) {
    await bucket.delete(keys.slice(start, start + 1_000)).catch(() => undefined);
  }
}
