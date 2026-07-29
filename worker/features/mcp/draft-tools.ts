import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { type MailboxAccessLevel, requireMailboxAccess } from "../../auth/mailbox-access";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { parseWith } from "../../lib/validation";
import { recordAudit } from "../audit/service";
import {
  addDraftAttachment,
  deleteDraft,
  draftIdsForAttachmentIds,
  getDraft,
  listDrafts,
  removeDraftAttachment,
  saveDraft
} from "../drafts/queries";
import type { Draft } from "../drafts/types";
import { draftSchema } from "../drafts/validation";
import { listMailboxesForUser } from "../mailboxes/queries";
import type { Mailbox } from "../mailboxes/types";
import { getMessageMailboxId } from "../messages/queries";

import type { McpPrincipal } from "./route";
import { base64File, maxMcpAttachmentBase64Length, toolResult } from "./tool-result";

const recipients = z.array(z.string().email()).max(50);
const createDraftShape = {
  mailboxId: z.string().min(1).max(100).nullable().default(null),
  replyToMessageId: z.string().min(1).max(100).nullable().default(null),
  forwardOfMessageId: z.string().min(1).max(100).nullable().default(null),
  from: z.union([z.literal(""), z.string().email()]).default(""),
  to: recipients.default([]),
  cc: recipients.default([]),
  bcc: recipients.default([]),
  subject: z.string().max(200).default(""),
  text: z.string().max(100_000).default(""),
  html: z.string().max(200_000).default("")
};

export function registerDraftTools(
  server: McpServer,
  env: WorkerEnv,
  principal: McpPrincipal
): void {
  if (!principal.scopes.has("mail:send")) return;

  server.registerTool(
    "list_drafts",
    {
      description: "List this user's drafts that remain accessible through live mailbox grants.",
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    () =>
      toolResult(async () => {
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
      })
  );

  server.registerTool(
    "get_draft",
    {
      description: "Open one user-owned draft after rechecking its live mailbox access.",
      inputSchema: { draftId: z.string().min(1).max(100) },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ draftId }) =>
      toolResult(async () => {
        const draft = await ownedDraft(env, principal, draftId);
        await requireDraftAccess(env, principal, draft);
        return draft;
      })
  );

  server.registerTool(
    "create_draft",
    {
      description: "Create a user-owned draft for an allowed sending mailbox.",
      inputSchema: createDraftShape,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    (input) =>
      toolResult(async () => {
        const parsed = parseWith(draftSchema, input);
        await requireDraftAccess(env, principal, parsed);
        const draft = await saveDraft(env.DB, principal.userId, parsed);
        await recordDraftMutation(env, principal, "mcp.draft.create", draft.id);
        return draft;
      })
  );

  server.registerTool(
    "update_draft",
    {
      description:
        "Update a user-owned draft by version; omitted fields preserve their current values.",
      inputSchema: {
        draftId: z.string().min(1).max(100),
        version: z.number().int().positive(),
        mailboxId: createDraftShape.mailboxId.optional(),
        replyToMessageId: createDraftShape.replyToMessageId.optional(),
        forwardOfMessageId: createDraftShape.forwardOfMessageId.optional(),
        from: createDraftShape.from.optional(),
        to: recipients.optional(),
        cc: recipients.optional(),
        bcc: recipients.optional(),
        subject: createDraftShape.subject.optional(),
        text: createDraftShape.text.optional(),
        html: createDraftShape.html.optional()
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    ({ draftId, version, ...changes }) =>
      toolResult(async () => {
        const current = await ownedDraft(env, principal, draftId);
        await requireDraftAccess(env, principal, current);
        const parsed = parseWith(draftSchema, {
          ...current,
          ...changes,
          id: draftId,
          version
        });
        await requireDraftAccess(env, principal, parsed);
        const draft = await saveDraft(env.DB, principal.userId, parsed);
        await recordDraftMutation(env, principal, "mcp.draft.update", draft.id);
        return draft;
      })
  );

  server.registerTool(
    "delete_draft",
    {
      description: "Delete one accessible user-owned draft and its staged attachments.",
      inputSchema: { draftId: z.string().min(1).max(100) },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    ({ draftId }) =>
      toolResult(async () => {
        const draft = await ownedDraft(env, principal, draftId);
        await requireDraftAccess(env, principal, draft);
        await deleteDraft(env.DB, env.MAIL_OBJECTS, principal.userId, draftId);
        await recordDraftMutation(env, principal, "mcp.draft.delete", draftId);
        return { deleted: true, draftId };
      })
  );

  registerDraftAttachmentTools(server, env, principal);
}

function registerDraftAttachmentTools(
  server: McpServer,
  env: WorkerEnv,
  principal: McpPrincipal
): void {
  server.registerTool(
    "add_draft_attachment",
    {
      description: "Stage a base64 attachment of at most 10 MiB on an accessible draft.",
      inputSchema: {
        draftId: z.string().min(1).max(100),
        filename: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .regex(/^[^\p{Cc}/\\"]+$/u),
        contentType: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .regex(/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/)
          .default("application/octet-stream"),
        contentBase64: z
          .string()
          .max(maxMcpAttachmentBase64Length)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/)
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    (input) =>
      toolResult(async () => {
        const draft = await ownedDraft(env, principal, input.draftId);
        await requireDraftAccess(env, principal, draft);
        const file = base64File(input);
        const added = await addDraftAttachment(env.DB, principal.userId, draft.id, file);
        await env.MAIL_OBJECTS.put(added.r2Key, file.stream(), {
          httpMetadata: { contentType: added.attachment.contentType }
        });
        await recordDraftMutation(env, principal, "mcp.draft.attachment.add", added.attachment.id);
        return added.attachment;
      })
  );

  server.registerTool(
    "remove_draft_attachment",
    {
      description: "Remove one staged attachment from an accessible user-owned draft.",
      inputSchema: {
        draftId: z.string().min(1).max(100),
        attachmentId: z.string().min(1).max(100)
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    ({ draftId, attachmentId }) =>
      toolResult(async () => {
        const draft = await ownedDraft(env, principal, draftId);
        await requireDraftAccess(env, principal, draft);
        if (
          !(await removeDraftAttachment(
            env.DB,
            env.MAIL_OBJECTS,
            principal.userId,
            draftId,
            attachmentId
          ))
        ) {
          throw new AppError("ATTACHMENT_NOT_FOUND", "Attachment not found.", 404);
        }
        await recordDraftMutation(env, principal, "mcp.draft.attachment.remove", attachmentId);
        return { deleted: true, attachmentId, draftId };
      })
  );
}

export async function requireDraftIdAccess(
  env: WorkerEnv,
  principal: McpPrincipal,
  draftId?: string
): Promise<void> {
  if (!draftId) return;
  await requireDraftAccess(env, principal, await ownedDraft(env, principal, draftId));
}

export async function requireDraftAttachmentIdsAccess(
  env: WorkerEnv,
  principal: McpPrincipal,
  attachmentIds: string[]
): Promise<void> {
  for (const draftId of await draftIdsForAttachmentIds(env.DB, principal.userId, attachmentIds)) {
    await requireDraftAccess(env, principal, await ownedDraft(env, principal, draftId));
  }
}

async function ownedDraft(env: WorkerEnv, principal: McpPrincipal, draftId: string) {
  const draft = await getDraft(env.DB, principal.userId, draftId);
  if (!draft) throw new AppError("DRAFT_NOT_FOUND", "Draft not found.", 404);
  return draft;
}

async function requireDraftAccess(
  env: WorkerEnv,
  principal: McpPrincipal,
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
    await requireMailboxAccess(
      env.DB,
      principal.userId,
      principal.role,
      await getMessageMailboxId(env.DB, messageId),
      "agent"
    );
  }
}

function recordDraftMutation(
  env: WorkerEnv,
  principal: McpPrincipal,
  action: string,
  resourceId: string
) {
  return recordAudit(env.DB, {
    correlationId: crypto.randomUUID(),
    actorType: "user",
    actorId: principal.userId,
    action,
    resourceType: "draft",
    resourceId,
    outcome: "success"
  });
}
