import { newId, nowIso } from "../../db/client";
import type { InsertAttachmentInput, InsertMessageInput } from "./types";

export function messageValues(input: InsertMessageInput, id = newId("msg")) {
  const timestamp = nowIso();
  return {
    ...input,
    id,
    replyTo: input.replyTo ?? [],
    textR2Key: input.textR2Key ?? null,
    deliveredToAddress: input.deliveredToAddress ?? null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function attachmentValues(input: InsertAttachmentInput, id = newId("att")) {
  return { ...input, id, createdAt: nowIso() };
}
