import { newId, nowIso } from "../../db/client";
import { parseRawEmail } from "../../email/parse-email";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { findMailboxByAddress } from "../mailboxes/queries";
import { sendNewMessage } from "../send/service";
import { decodeBase64 } from "./codec";

export type BridgeSubmission = {
  idempotencyKey: string;
  mailFrom: string;
  recipients: string[];
  raw: string;
};

export async function submitMessage(env: WorkerEnv, userId: string, input: BridgeSubmission) {
  const duplicate = await env.DB.prepare(
    "SELECT 1 FROM pro_bridge_submissions WHERE idempotency_key = ? AND user_id = ?"
  )
    .bind(input.idempotencyKey, userId)
    .first();
  if (duplicate) return;
  const mailbox = await findMailboxByAddress(env.DB, input.mailFrom.toLowerCase());
  if (!mailbox?.isActive) {
    throw new AppError("SENDER_NOT_ALLOWED", "Sender is not an active mailbox.", 403);
  }
  const raw = decodeBase64(input.raw);
  const parsed = await parseRawEmail(raw);
  const sent = await sendNewMessage(env, {
    from: mailbox.address,
    to: input.recipients,
    cc: [],
    bcc: [],
    subject: parsed.subject,
    text: parsed.textBody || parsed.snippet || "(no text body)",
    ...(parsed.htmlBody ? { html: parsed.htmlBody } : {})
  });
  const rawKey = `sent/${nowIso().slice(0, 10)}/${newId("raw")}.eml`;
  await env.MAIL_OBJECTS.put(rawKey, raw, { httpMetadata: { contentType: "message/rfc822" } });
  await env.DB.batch([
    env.DB.prepare("UPDATE messages SET raw_r2_key = ?, updated_at = ? WHERE id = ?").bind(
      rawKey,
      nowIso(),
      sent.id
    ),
    env.DB.prepare(
      "INSERT INTO pro_bridge_submissions (idempotency_key, user_id, message_id, created_at) VALUES (?, ?, ?, ?)"
    ).bind(input.idempotencyKey, userId, sent.id, nowIso())
  ]);
}
