import { nowIso } from "../../db/client";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";

export type BridgeMutation = {
  idempotencyKey: string;
  operation: string;
  mailbox?: string | undefined;
  target?: string | undefined;
  destination?: string | undefined;
  flags?: string[] | undefined;
  raw?: string | undefined;
};

export function parseUIDs(target: string): number[] {
  const values = new Set<number>();
  for (const segment of target.split(",")) {
    const [startText, endText] = segment.split(":");
    const start = Number(startText);
    const end = Number(endText ?? startText);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end < start ||
      end - start > 10_000
    ) {
      throw new AppError("INVALID_UID_SET", "Mutation target is not a supported UID set.", 400);
    }
    for (let value = start; value <= end; value += 1) values.add(value);
  }
  return [...values];
}

export async function applyMutation(env: WorkerEnv, userId: string, input: BridgeMutation) {
  const duplicate = await env.DB.prepare(
    "SELECT 1 FROM pro_bridge_mutations WHERE idempotency_key = ? AND user_id = ?"
  )
    .bind(input.idempotencyKey, userId)
    .first();
  if (duplicate) return;
  if (input.operation !== "store-flags" || !input.mailbox || !input.target) {
    throw new AppError("MUTATION_UNSUPPORTED", "This IMAP mutation is not supported yet.", 422);
  }
  const mailbox = await env.DB.prepare(
    "SELECT id FROM pro_imap_mailboxes WHERE user_id = ? AND name = ?"
  )
    .bind(userId, input.mailbox)
    .first<{ id: string }>();
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "IMAP mailbox not found.", 404);
  const timestamp = nowIso();
  for (const uid of parseUIDs(input.target)) {
    await env.DB.prepare(
      "UPDATE pro_imap_messages SET flags_json = ?, updated_at = ? WHERE mailbox_id = ? AND uid = ?"
    )
      .bind(JSON.stringify(input.flags ?? []), timestamp, mailbox.id, uid)
      .run();
  }
  await env.DB.prepare(
    "INSERT INTO pro_bridge_mutations (idempotency_key, user_id, created_at) VALUES (?, ?, ?)"
  )
    .bind(input.idempotencyKey, userId, timestamp)
    .run();
}
