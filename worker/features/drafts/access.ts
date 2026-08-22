import { type MailboxAccessLevel, requireMailboxAccess } from "../../auth/mailbox-access";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import type { WorkspaceRole } from "../../lib/validation";
import { listMailboxesForUser } from "../mailboxes/queries";
import type { Mailbox } from "../mailboxes/types";
import { requireMessageAccess } from "../messages/access";

import { draftIdsForAttachmentIds, getDraft, listDrafts } from "./queries";
import type { Draft } from "./types";

export type DraftPrincipal = { role: WorkspaceRole; userId: string };

export async function listAccessibleDrafts(
  env: WorkerEnv,
  principal: DraftPrincipal
): Promise<Draft[]> {
  const drafts = await listDrafts(env.DB, principal.userId);
  const mailboxes = await listMailboxesForUser(env.DB, principal.userId, principal.role);
  const visibility = await Promise.all(
    drafts.map(async (draft) => {
      try {
        await requireDraftAccess(env, principal, draft, mailboxes);
        return draft;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        return null;
      }
    })
  );
  return visibility.filter((draft): draft is Draft => draft !== null);
}

export async function getAccessibleDraft(
  env: WorkerEnv,
  principal: DraftPrincipal,
  draftId: string
): Promise<Draft> {
  const draft = await getDraft(env.DB, principal.userId, draftId);
  if (!draft) throw new AppError("DRAFT_NOT_FOUND", "Draft not found.", 404);
  await requireDraftAccess(env, principal, draft);
  return draft;
}

export async function requireDraftIdAccess(
  env: WorkerEnv,
  principal: DraftPrincipal,
  draftId?: string
): Promise<void> {
  if (draftId) await getAccessibleDraft(env, principal, draftId);
}

export async function requireDraftAttachmentIdsAccess(
  env: WorkerEnv,
  principal: DraftPrincipal,
  attachmentIds: string[]
): Promise<void> {
  for (const draftId of await draftIdsForAttachmentIds(env.DB, principal.userId, attachmentIds)) {
    await getAccessibleDraft(env, principal, draftId);
  }
}

export async function requireDraftAccess(
  env: WorkerEnv,
  principal: DraftPrincipal,
  draft: Pick<Draft, "mailboxId" | "from" | "replyToMessageId" | "forwardOfMessageId">,
  knownMailboxes?: Array<Mailbox & { accessLevel: MailboxAccessLevel | null }>
): Promise<void> {
  let sendingMailboxId = draft.mailboxId;
  if (draft.from) {
    const mailboxes =
      knownMailboxes ?? (await listMailboxesForUser(env.DB, principal.userId, principal.role));
    const normalizedFrom = draft.from.toLowerCase();
    const mailbox = mailboxes.find(
      (candidate) =>
        candidate.address.toLowerCase() === normalizedFrom ||
        candidate.addresses.some((address) => address.address.toLowerCase() === normalizedFrom)
    );
    if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
    if (sendingMailboxId && sendingMailboxId !== mailbox.id) {
      throw new AppError(
        "DRAFT_MAILBOX_MISMATCH",
        "Draft sender does not belong to the selected mailbox.",
        400
      );
    }
    sendingMailboxId = mailbox.id;
  }
  if (sendingMailboxId) {
    await requireMailboxAccess(env.DB, principal.userId, principal.role, sendingMailboxId, "agent");
  }
  for (const messageId of [draft.replyToMessageId, draft.forwardOfMessageId]) {
    if (!messageId) continue;
    await requireMessageAccess(env.DB, principal.userId, principal.role, messageId, "agent");
  }
}
