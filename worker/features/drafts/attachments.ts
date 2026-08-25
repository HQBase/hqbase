import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { hasSafeInlineImageMagic } from "../messages/inline-media";
import { draftAttachmentRecordExists } from "./attachment-lookups";
import { addDraftAttachment, deleteDraftAttachmentRecord } from "./queries";
import type { DraftAttachment } from "./types";

const inlineImageHeaderBytes = 64;

export async function storeDraftAttachment(
  env: Pick<WorkerEnv, "DB" | "MAIL_OBJECTS">,
  principalId: string,
  draftId: string,
  file: File,
  inline: boolean
): Promise<DraftAttachment> {
  if (inline) {
    const header = new Uint8Array(await file.slice(0, inlineImageHeaderBytes).arrayBuffer());
    if (!hasSafeInlineImageMagic(file.type, header, file.size)) {
      throw new AppError("INLINE_MEDIA_UNSUPPORTED", "File cannot be displayed inline.", 415);
    }
  }
  const added = await addDraftAttachment(env.DB, principalId, draftId, file, inline);
  try {
    await env.MAIL_OBJECTS.put(added.r2Key, file.stream(), {
      httpMetadata: { contentType: added.attachment.contentType }
    });
    if (
      !(await draftAttachmentRecordExists(
        env.DB,
        principalId,
        draftId,
        added.attachment.id,
        added.r2Key
      ))
    ) {
      throw new AppError("ATTACHMENT_NOT_FOUND", "Attachment is no longer available.", 404);
    }
  } catch (error) {
    await Promise.allSettled([
      deleteDraftAttachmentRecord(env.DB, draftId, added.attachment.id),
      env.MAIL_OBJECTS.delete(added.r2Key)
    ]);
    throw error;
  }
  return added.attachment;
}
