import { sql } from "drizzle-orm";

import {
  accessAllows,
  canAccessUnassignedMail,
  type MailboxAccessLevel
} from "../../auth/mailbox-access";
import { getRow, getRows } from "../../db/drizzle";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import type { WorkspaceRole } from "../../lib/validation";
import { listMailboxesForUser } from "../mailboxes/queries";
import type { Mailbox } from "../mailboxes/types";

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
  const context = await loadDraftAccessContext(env, principal, drafts);
  return drafts.filter((draft) => draftAccessDenial({ context, draft, principal }) === null);
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
  draft: DraftAccessTarget
): Promise<void> {
  const context = await loadDraftAccessContext(env, principal, [draft]);
  const denial = draftAccessDenial({ context, draft, principal });
  if (denial) throw new AppError(denial.code, denial.message, denial.status);
}

type DraftAccessTarget = Pick<
  Draft,
  "mailboxId" | "from" | "replyToMessageId" | "forwardOfMessageId"
>;

type DraftAccessContext = {
  active: boolean;
  mailboxes: Array<Mailbox & { accessLevel: MailboxAccessLevel | null }>;
  messageTargets: Map<string, DraftMessageTarget>;
};

type DraftAccessDenial = {
  code: string;
  message: string;
  status: number;
};

async function loadDraftAccessContext(
  env: WorkerEnv,
  principal: DraftPrincipal,
  drafts: DraftAccessTarget[]
): Promise<DraftAccessContext> {
  const messageIds = [
    ...new Set(
      drafts.flatMap((draft) =>
        [draft.replyToMessageId, draft.forwardOfMessageId].filter((id): id is string => id !== null)
      )
    )
  ];
  const [active, mailboxes, messageTargets] = await Promise.all([
    draftPrincipalIsActive(env.DB, principal.userId),
    listMailboxesForUser(env.DB, principal.userId, principal.role),
    getDraftMessageTargets(env.DB, messageIds)
  ]);
  return { active, mailboxes, messageTargets };
}

async function draftPrincipalIsActive(db: D1Database, userId: string): Promise<boolean> {
  const row = await getRow<{ active: number }>(
    db,
    sql`SELECT CASE WHEN COALESCE(banned, 0) = 0 THEN 1 ELSE 0 END AS active
        FROM "user" WHERE id = ${userId}`
  );
  return row?.active === 1;
}

function draftAccessDenial(input: {
  context: DraftAccessContext;
  draft: DraftAccessTarget;
  principal: DraftPrincipal;
}): DraftAccessDenial | null {
  const { context, draft, principal } = input;
  if (!context.active) {
    return {
      code: "MAILBOX_FORBIDDEN",
      message: "You do not have access to drafts.",
      status: 403
    };
  }
  let sendingMailboxId = draft.mailboxId;
  if (draft.from) {
    const normalizedFrom = draft.from.toLowerCase();
    const mailbox = context.mailboxes.find(
      (candidate) => candidate.address.toLowerCase() === normalizedFrom
    );
    if (!mailbox) {
      return { code: "MAILBOX_NOT_FOUND", message: "Sending mailbox not found.", status: 404 };
    }
    if (sendingMailboxId && sendingMailboxId !== mailbox.id) {
      return {
        code: "DRAFT_MAILBOX_MISMATCH",
        message: "Draft sender does not belong to the selected mailbox.",
        status: 400
      };
    }
    sendingMailboxId = mailbox.id;
  }
  if (sendingMailboxId) {
    const mailbox = context.mailboxes.find((candidate) => candidate.id === sendingMailboxId);
    if (!mailbox || !accessAllows(mailbox.accessLevel, "agent")) {
      return {
        code: "MAILBOX_FORBIDDEN",
        message: "You do not have access to this mailbox.",
        status: 403
      };
    }
  }
  for (const messageId of [draft.replyToMessageId, draft.forwardOfMessageId]) {
    if (!messageId) continue;
    const target = context.messageTargets.get(messageId);
    if (!target || (target.is_unassigned !== 1 && target.mailbox_id === null)) {
      return { code: "MESSAGE_NOT_FOUND", message: "Message not found.", status: 404 };
    }
    if (target.is_unassigned === 1) {
      if (!canAccessUnassignedMail(principal.role)) {
        return {
          code: "MAILBOX_FORBIDDEN",
          message: "You do not have access to this message.",
          status: 403
        };
      }
      continue;
    }
    const mailbox = context.mailboxes.find((candidate) => candidate.id === target.mailbox_id);
    if (!mailbox || !accessAllows(mailbox.accessLevel, "agent")) {
      return {
        code: "MAILBOX_FORBIDDEN",
        message: "You do not have access to this mailbox.",
        status: 403
      };
    }
  }
  return null;
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
  const rows: DraftMessageTarget[] = [];
  for (let index = 0; index < messageIds.length; index += 100) {
    const batch = messageIds.slice(index, index + 100);
    rows.push(
      ...(await getRows<DraftMessageTarget>(
        db,
        sql`SELECT id, mailbox_id, is_unassigned
            FROM messages
            WHERE id IN (${sql.join(
              batch.map((id) => sql`${id}`),
              sql`, `
            )})`
      ))
    );
  }
  return new Map(rows.map((row) => [row.id, row]));
}
