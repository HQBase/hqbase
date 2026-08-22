import { sql } from "drizzle-orm";

import {
  accessAllows,
  canAccessUnassignedMail,
  type MailboxAccessLevel,
  requireMailboxAccess
} from "../../auth/mailbox-access";
import { getRows } from "../../db/drizzle";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import type { WorkspaceRole } from "../../lib/validation";
import { listMailboxesForUser } from "../mailboxes/queries";
import type { Mailbox } from "../mailboxes/types";
import { requireMessageAccess } from "../messages/access";

import { defaultDraftLimit, listDraftPage } from "./list-queries";
import { draftIdsForAttachmentIds, getDraft } from "./queries";
import type { Draft } from "./types";

export type DraftPrincipal = { role: WorkspaceRole; userId: string };

export type AccessibleDraftPage = {
  drafts: Draft[];
  nextCursor: string | null;
};

export async function listAccessibleDrafts(
  env: WorkerEnv,
  principal: DraftPrincipal
): Promise<Draft[]> {
  const drafts: Draft[] = [];
  let cursor: string | undefined;
  do {
    const page = await listAccessibleDraftPage(env, principal, {
      cursor,
      limit: defaultDraftLimit
    });
    drafts.push(...page.drafts);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return drafts;
}

export async function listAccessibleDraftPage(
  env: WorkerEnv,
  principal: DraftPrincipal,
  input: { cursor?: string | undefined; limit: number }
): Promise<AccessibleDraftPage> {
  const page = await listDraftPage(env.DB, principal.userId, input);
  return {
    drafts: await filterAccessibleDrafts(env, principal, page.drafts),
    nextCursor: page.nextCursor
  };
}

export async function filterAccessibleDrafts(
  env: WorkerEnv,
  principal: DraftPrincipal,
  drafts: Draft[]
): Promise<Draft[]> {
  if (drafts.length === 0) return [];
  const mailboxes = await listMailboxesForUser(env.DB, principal.userId, principal.role);
  const messageIds = [
    ...new Set(
      drafts.flatMap((draft) =>
        [draft.replyToMessageId, draft.forwardOfMessageId].filter((id): id is string => id !== null)
      )
    )
  ];
  const messageTargets = await getDraftMessageTargets(env.DB, messageIds);
  return drafts.filter((draft) =>
    draftIsAccessible({ draft, mailboxes, messageTargets, principal })
  );
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

type DraftMessageTarget = {
  id: string;
  is_unassigned: number;
  mailbox_id: string | null;
};

async function getDraftMessageTargets(
  db: D1Database,
  messageIds: string[]
): Promise<Map<string, DraftMessageTarget>> {
  if (messageIds.length === 0) return new Map();
  const rows = await getRows<DraftMessageTarget>(
    db,
    sql`SELECT id, mailbox_id, is_unassigned
        FROM messages
        WHERE id IN (${sql.join(
          messageIds.map((id) => sql`${id}`),
          sql`, `
        )})`
  );
  return new Map(rows.map((row) => [row.id, row]));
}

function draftIsAccessible(input: {
  draft: Draft;
  mailboxes: Array<Mailbox & { accessLevel: MailboxAccessLevel | null }>;
  messageTargets: Map<string, DraftMessageTarget>;
  principal: DraftPrincipal;
}): boolean {
  const { draft, mailboxes, messageTargets, principal } = input;
  let sendingMailboxId = draft.mailboxId;
  if (draft.from) {
    const normalizedFrom = draft.from.toLowerCase();
    const mailbox = mailboxes.find(
      (candidate) =>
        candidate.address.toLowerCase() === normalizedFrom ||
        candidate.addresses.some((address) => address.address.toLowerCase() === normalizedFrom)
    );
    if (!mailbox || (sendingMailboxId !== null && sendingMailboxId !== mailbox.id)) return false;
    sendingMailboxId = mailbox.id;
  }
  if (sendingMailboxId) {
    const mailbox = mailboxes.find((candidate) => candidate.id === sendingMailboxId);
    if (!mailbox || !accessAllows(mailbox.accessLevel, "agent")) return false;
  }
  for (const messageId of [draft.replyToMessageId, draft.forwardOfMessageId]) {
    if (!messageId) continue;
    const target = messageTargets.get(messageId);
    if (!target) return false;
    if (target.is_unassigned === 1) {
      if (!canAccessUnassignedMail(principal.role)) return false;
      continue;
    }
    if (!target.mailbox_id) return false;
    const mailbox = mailboxes.find((candidate) => candidate.id === target.mailbox_id);
    if (!mailbox || !accessAllows(mailbox.accessLevel, "agent")) return false;
  }
  return true;
}
