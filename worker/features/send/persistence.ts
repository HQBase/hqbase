import { eq, sql } from "drizzle-orm";
import { nowIso } from "../../db/client";
import { createDatabase, getRow, preparedStatement } from "../../db/drizzle";
import { messageAttachments, messages, sendOperations, threads } from "../../db/schema";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { normalizeSubject } from "../messages/headers";
import { mapMessageSummary } from "../messages/queries";
import type { MessageRow, MessageSummary } from "../messages/types";
import { deleteObjectKeys } from "./attachment-storage";
import type { SendOperation, SendPayload } from "./operations";

export async function finishSend(
  env: WorkerEnv,
  operation: SendOperation,
  payload: SendPayload,
  providerId: string
): Promise<MessageSummary> {
  const database = createDatabase(env.DB);
  const prepare = (query: Parameters<typeof preparedStatement>[1]) =>
    preparedStatement(env.DB, query);
  const statements = [
    prepare(
      database
        .update(sendOperations)
        .set({
          status: "stored",
          providerMessageId: providerId,
          objectKeys: [],
          updatedAt: nowIso()
        })
        .where(eq(sendOperations.id, operation.id))
    )
  ];
  if (payload.createThread)
    statements.push(
      prepare(
        database
          .insert(threads)
          .values({
            id: payload.message.threadId,
            subjectNormalized: normalizeSubject(payload.message.subject),
            lastMessageAt: payload.message.sentAt ?? payload.message.createdAt,
            createdAt: payload.message.createdAt,
            updatedAt: payload.message.updatedAt
          })
          .onConflictDoNothing()
      )
    );
  statements.push(
    prepare(
      database
        .insert(messages)
        .values({ ...payload.message, messageId: providerId })
        .onConflictDoNothing({ target: messages.id })
    )
  );
  for (let start = 0; start < payload.attachments.length; start += 8) {
    statements.push(
      prepare(
        database
          .insert(messageAttachments)
          .values(payload.attachments.slice(start, start + 8))
          .onConflictDoNothing()
      )
    );
  }
  statements.push(
    env.DB.prepare(
      `UPDATE threads SET last_message_at = MAX(last_message_at, ?), updated_at = ? WHERE id = ?`
    ).bind(payload.message.sentAt, nowIso(), payload.message.threadId)
  );
  if (operation.draft_id && operation.principal_id) {
    statements.push(
      env.DB.prepare(`INSERT OR IGNORE INTO message_labels
      (message_id, label_id, assigned_by_principal_id, created_at)
      SELECT ?, assignment.label_id, assignment.assigned_by_principal_id, assignment.created_at
      FROM draft_labels assignment JOIN drafts draft ON draft.id = assignment.draft_id
      WHERE draft.id = ? AND draft.principal_id = ?`).bind(
        payload.message.id,
        operation.draft_id,
        operation.principal_id
      )
    );
    statements.push(
      env.DB.prepare("DELETE FROM drafts WHERE id = ? AND principal_id = ?").bind(
        operation.draft_id,
        operation.principal_id
      )
    );
  }
  await env.DB.batch(statements);
  await deleteObjectKeys(env.MAIL_OBJECTS, [operation.payload_r2_key, operation.receipt_r2_key]);
  return storedResult(env.DB, payload.message.id);
}

export async function storedResult(db: D1Database, id: string): Promise<MessageSummary> {
  const message = await getRow<MessageRow>(db, sql`SELECT * FROM messages WHERE id = ${id}`);
  if (!message)
    throw new AppError(
      "SEND_RESULT_UNAVAILABLE",
      "This send completed, but its stored message is no longer available.",
      410
    );
  return mapMessageSummary(message);
}
