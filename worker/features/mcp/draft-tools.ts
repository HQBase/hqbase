import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { parseWith } from "../../lib/validation";
import { recordAudit } from "../audit/service";
import { getAccessibleDraft, listAccessibleDrafts, requireDraftAccess } from "../drafts/access";
import {
  addDraftAttachment,
  deleteDraft,
  removeDraftAttachment,
  saveDraft
} from "../drafts/queries";
import { draftSchema } from "../drafts/validation";
import {
  type MailEventScheduler,
  publishUserMailEvent,
  scheduleMailEvent
} from "../events/service";
import { resolveDraftSignature } from "../signatures/service";
import { signatureSelectionSchema } from "../signatures/validation";

import type { McpPrincipal } from "./route";
import { base64File, maxMcpAttachmentBase64Length, toolResult } from "./tool-result";

const recipients = z.array(z.string().email()).max(50);
const draftFields = {
  mailboxId: z.string().min(1).max(100).nullable(),
  replyToMessageId: z.string().min(1).max(100).nullable(),
  forwardOfMessageId: z.string().min(1).max(100).nullable(),
  from: z.union([z.literal(""), z.string().email()]),
  to: recipients,
  cc: recipients,
  bcc: recipients,
  subject: z.string().max(200),
  text: z.string().max(100_000),
  html: z.string().max(200_000),
  signature: signatureSelectionSchema
};
const createDraftShape = {
  mailboxId: draftFields.mailboxId.default(null),
  replyToMessageId: draftFields.replyToMessageId.default(null),
  forwardOfMessageId: draftFields.forwardOfMessageId.default(null),
  from: draftFields.from.default(""),
  to: draftFields.to.default([]),
  cc: draftFields.cc.default([]),
  bcc: draftFields.bcc.default([]),
  subject: draftFields.subject.default(""),
  text: draftFields.text.default(""),
  html: draftFields.html.default(""),
  signature: draftFields.signature.default({ mode: "automatic" })
};

export function registerDraftTools(
  server: McpServer,
  env: WorkerEnv,
  principal: McpPrincipal,
  schedule: MailEventScheduler
): void {
  if (!principal.scopes.has("mail:send")) return;

  server.registerTool(
    "list_drafts",
    {
      description: "List this user's drafts that remain accessible through live mailbox grants.",
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    () => toolResult(() => listAccessibleDrafts(env, principal))
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
        return getAccessibleDraft(env, principal, draftId);
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
        const signature = await resolveDraftSignature(env.DB, signaturePrincipal(principal), {
          from: parsed.from,
          selection: parsed.signature
        });
        const draft = await saveDraft(env.DB, principal.userId, { ...parsed, signature });
        await recordDraftMutation(env, principal, "mcp.draft.create", draft.id);
        notifyDraftChange(env, principal.userId, schedule);
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
        mailboxId: draftFields.mailboxId.optional(),
        replyToMessageId: draftFields.replyToMessageId.optional(),
        forwardOfMessageId: draftFields.forwardOfMessageId.optional(),
        from: draftFields.from.optional(),
        to: draftFields.to.optional(),
        cc: draftFields.cc.optional(),
        bcc: draftFields.bcc.optional(),
        subject: draftFields.subject.optional(),
        text: draftFields.text.optional(),
        html: draftFields.html.optional(),
        signature: draftFields.signature.optional()
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    ({ draftId, version, ...changes }) =>
      toolResult(async () => {
        const current = await getAccessibleDraft(env, principal, draftId);
        const parsed = parseWith(draftSchema, {
          ...current,
          ...changes,
          id: draftId,
          signature: changes.signature,
          version
        });
        await requireDraftAccess(env, principal, parsed);
        const signature = await resolveDraftSignature(env.DB, signaturePrincipal(principal), {
          from: parsed.from,
          selection: parsed.signature,
          current: { from: current.from, signature: current.signature }
        });
        const draft = await saveDraft(env.DB, principal.userId, { ...parsed, signature });
        await recordDraftMutation(env, principal, "mcp.draft.update", draft.id);
        notifyDraftChange(env, principal.userId, schedule);
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
        await getAccessibleDraft(env, principal, draftId);
        await deleteDraft(env.DB, env.MAIL_OBJECTS, principal.userId, draftId);
        await recordDraftMutation(env, principal, "mcp.draft.delete", draftId);
        notifyDraftChange(env, principal.userId, schedule);
        return { deleted: true, draftId };
      })
  );

  registerDraftAttachmentTools(server, env, principal, schedule);
}

function registerDraftAttachmentTools(
  server: McpServer,
  env: WorkerEnv,
  principal: McpPrincipal,
  schedule: MailEventScheduler
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
        const draft = await getAccessibleDraft(env, principal, input.draftId);
        const file = base64File(input);
        const added = await addDraftAttachment(env.DB, principal.userId, draft.id, file);
        await env.MAIL_OBJECTS.put(added.r2Key, file.stream(), {
          httpMetadata: { contentType: added.attachment.contentType }
        });
        await recordDraftMutation(env, principal, "mcp.draft.attachment.add", added.attachment.id);
        notifyDraftChange(env, principal.userId, schedule);
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
        await getAccessibleDraft(env, principal, draftId);
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
        notifyDraftChange(env, principal.userId, schedule);
        return { deleted: true, attachmentId, draftId };
      })
  );
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

function notifyDraftChange(env: WorkerEnv, userId: string, schedule: MailEventScheduler): void {
  scheduleMailEvent(schedule, publishUserMailEvent(env, userId, "drafts"));
}

function signaturePrincipal(principal: McpPrincipal) {
  return { id: principal.userId, role: principal.role, type: "user" as const };
}
