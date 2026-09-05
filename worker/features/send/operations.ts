import { eq, sql } from "drizzle-orm";
import { newId, nowIso } from "../../db/client";
import { createDatabase, getRow } from "../../db/drizzle";
import { sendOperations } from "../../db/schema";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { attachmentValues, messageValues } from "../messages/storage";
import type { InsertMessageInput, MessageSummary } from "../messages/types";
import { pendingSendGuards } from "../updates/migration-names";
import { deleteObjectKeys } from "./attachment-storage";
import type { StoredOutgoingAttachment } from "./content-attachments";
import { finishSend, storedResult } from "./persistence";

export type SendIdentity = {
  id: string;
  hash: string;
  principalId: string | null;
  draftId: string | null;
};
export type SendPayload = {
  message: ReturnType<typeof messageValues>;
  attachments: ReturnType<typeof attachmentValues>[];
  createThread: boolean;
};
export type SendOperation = {
  id: string;
  principal_id: string | null;
  draft_id: string | null;
  request_hash: string;
  status: "sending" | "accepted" | "stored" | "unknown";
  message_id: string;
  provider_message_id: string | null;
  payload_r2_key: string;
  receipt_r2_key: string;
};

export async function identifySend(
  principalId: string | undefined,
  input: { draftId?: string | undefined; idempotencyKey?: string | undefined },
  kind: string
): Promise<SendIdentity> {
  const key = input.idempotencyKey ?? (input.draftId ? `draft:${input.draftId}` : null);
  return {
    id: key ? `snd_${await digest(JSON.stringify([principalId ?? null, key]))}` : newId("snd"),
    hash: await digest(canonicalJson({ kind, input })),
    principalId: principalId ?? null,
    draftId: input.draftId ?? null
  };
}

export async function resumeSend(
  env: WorkerEnv,
  identity: SendIdentity
): Promise<MessageSummary | null> {
  const row = await getRow<SendOperation>(
    env.DB,
    sql`SELECT * FROM send_operations WHERE id = ${identity.id}`
  );
  if (!row) return null;
  if (row.principal_id !== identity.principalId || row.request_hash !== identity.hash) {
    throw new AppError("SEND_KEY_CONFLICT", "This send key belongs to a different request.", 409);
  }
  if (row.status === "stored") return storedResult(env.DB, row.message_id);
  let providerId = row.provider_message_id;
  if (!providerId) {
    const receipt = await env.MAIL_OBJECTS.get(row.receipt_r2_key);
    if (receipt) {
      const value = await receipt.json<{ messageId: string }>();
      providerId = value.messageId;
    }
  }
  if (!providerId) throw uncertain(row.id);
  const object = await env.MAIL_OBJECTS.get(row.payload_r2_key);
  if (!object) {
    const latest = await getRow<SendOperation>(
      env.DB,
      sql`SELECT * FROM send_operations WHERE id = ${identity.id}`
    );
    if (latest?.status === "stored") return storedResult(env.DB, latest.message_id);
  }
  if (!object)
    throw new AppError(
      "SEND_RECOVERY_UNAVAILABLE",
      "Accepted mail needs storage recovery. Do not send it again.",
      503
    );
  return finishSend(env, row, await object.json<SendPayload>(), providerId);
}

export async function reserveSend(
  env: WorkerEnv,
  identity: SendIdentity,
  payload: SendPayload
): Promise<SendOperation | null> {
  const guards = await getRow<{ count: number }>(
    env.DB,
    sql`
    SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'trigger'
      AND name IN (SELECT value FROM json_each(${JSON.stringify(pendingSendGuards)}))`
  );
  if (guards?.count !== pendingSendGuards.length) {
    throw new AppError(
      "SEND_STORAGE_NOT_READY",
      "Sending is unavailable until the database update finishes.",
      503
    );
  }
  const timestamp = nowIso();
  // Each attempt stages to a distinct key. A losing attempt cannot overwrite the winner's payload.
  const base = `send-operations/${identity.id}/${newId("obj")}`;
  const payloadR2Key = `${base}/payload.json`;
  const receiptR2Key = `${base}/receipt.json`;
  await env.MAIL_OBJECTS.put(payloadR2Key, JSON.stringify(payload), {
    httpMetadata: { contentType: "application/json" }
  });
  const database = createDatabase(env.DB);
  const result = await database
    .insert(sendOperations)
    .values({
      id: identity.id,
      principalId: identity.principalId,
      draftId: identity.draftId,
      mailboxId: payload.message.mailboxId,
      requestHash: identity.hash,
      status: "sending",
      messageId: payload.message.id,
      payloadR2Key,
      receiptR2Key,
      objectKeys: [
        payloadR2Key,
        receiptR2Key,
        payload.message.htmlR2Key,
        payload.message.textR2Key,
        ...payload.attachments.map((attachment) => attachment.r2Key)
      ].filter((key): key is string => Boolean(key)),
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoNothing()
    .run();
  if ((result.meta.changes ?? 0) !== 0)
    return {
      id: identity.id,
      principal_id: identity.principalId,
      draft_id: identity.draftId,
      request_hash: identity.hash,
      status: "sending",
      message_id: payload.message.id,
      provider_message_id: null,
      payload_r2_key: payloadR2Key,
      receipt_r2_key: receiptR2Key
    };
  await deleteObjectKeys(env.MAIL_OBJECTS, [payloadR2Key]);
  return null;
}

export async function acceptSend(
  env: WorkerEnv,
  row: SendOperation,
  payload: SendPayload,
  providerId: string
): Promise<MessageSummary> {
  // R2 receipt lets a later request finish storage even if D1 fails after provider acceptance.
  await env.MAIL_OBJECTS.put(row.receipt_r2_key, JSON.stringify({ messageId: providerId }), {
    httpMetadata: { contentType: "application/json" }
  }).catch(() => undefined);
  // D1 can still preserve acceptance when the independent R2 receipt is unavailable.
  await createDatabase(env.DB)
    .update(sendOperations)
    .set({
      status: "accepted",
      providerMessageId: providerId,
      updatedAt: nowIso()
    })
    .where(eq(sendOperations.id, row.id))
    .run();
  return finishSend(env, row, payload, providerId);
}

export async function markSendUnknown(env: WorkerEnv, identity: SendIdentity): Promise<void> {
  await createDatabase(env.DB)
    .update(sendOperations)
    .set({ status: "unknown", updatedAt: nowIso() })
    .where(eq(sendOperations.id, identity.id))
    .run()
    .catch(() => undefined);
}

export function uncertain(id: string): AppError {
  return new AppError(
    "SEND_OUTCOME_UNKNOWN",
    `Delivery is pending or uncertain. Do not send another copy. Reference: ${id}`,
    409
  );
}

export function makeSendPayload(
  input: InsertMessageInput,
  attachments: StoredOutgoingAttachment[],
  createThread: boolean
): SendPayload {
  const message = messageValues(input);
  return {
    message,
    createThread,
    attachments: attachments.map((attachment) =>
      attachmentValues({
        messageId: message.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        contentId: attachment.contentId,
        disposition: attachment.disposition,
        sizeBytes: attachment.sizeBytes,
        r2Key: attachment.r2Key
      })
    )
  };
}

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
