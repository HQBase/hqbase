import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { cleanupUnstoredObjects, stageOutgoingAttachments } from "./attachment-storage";
import type { StoredOutgoingAttachment } from "./content-attachments";
import {
  acceptSend,
  markSendUnknown,
  reserveSend,
  resumeSend,
  type SendIdentity,
  type SendPayload,
  uncertain
} from "./operations";

export async function deliverPreparedMail(
  env: WorkerEnv,
  identity: SendIdentity,
  payload: SendPayload,
  email: Parameters<SendEmail["send"]>[0],
  attachments: StoredOutgoingAttachment[]
) {
  await stageOutgoingAttachments(env.MAIL_OBJECTS, attachments);
  const operation = await reserveSend(env, identity, payload);
  if (!operation) {
    await cleanupUnstoredObjects(env, attachments);
    const previous = await resumeSend(env, identity);
    if (previous) return previous;
    throw new AppError("DRAFT_SEND_PENDING", "This draft already has a send operation.", 409);
  }
  let result: Awaited<ReturnType<SendEmail["send"]>>;
  try {
    result = await env.MAIL_SENDER.send(email);
  } catch {
    await markSendUnknown(env, identity);
    throw uncertain(identity.id);
  }
  try {
    return await acceptSend(env, operation, payload, result.messageId);
  } catch {
    throw new AppError(
      "SEND_ACCEPTED_STORAGE_PENDING",
      `Mail was accepted. Retry this same operation to finish storage; do not send a new copy. Reference: ${identity.id}`,
      503
    );
  }
}
