import type { WorkerEnv } from "../../lib/env";
import { referencedObjectKeys } from "../messages/object-references";

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
    const referencedKeys = await referencedObjectKeys(env.DB, uniqueKeys);
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
