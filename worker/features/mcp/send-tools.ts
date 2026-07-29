import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { requireMailboxAccess } from "../../auth/mailbox-access";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { parseWith } from "../../lib/validation";
import { enforceRateLimit } from "../../security/rate-limit";
import { recordAudit } from "../audit/service";
import { findMailboxForSending } from "../mailboxes/queries";
import { getMessageMailboxId } from "../messages/queries";
import { forwardMessage } from "../send/forward";
import { replyToMessage, sendNewMessage } from "../send/service";
import { forwardMessageSchema, replyMessageSchema, sendMessageSchema } from "../send/validation";

import { requireDraftAttachmentIdsAccess, requireDraftIdAccess } from "./draft-tools";
import type { McpPrincipal } from "./route";
import { toolResult } from "./tool-result";

const recipientList = z.array(z.string().email()).max(50);
const attachmentIds = z.array(z.string().min(1).max(100)).max(20).default([]);

export function registerSendTools(
  server: McpServer,
  env: WorkerEnv,
  principal: McpPrincipal
): void {
  if (!principal.scopes.has("mail:send")) return;

  server.registerTool(
    "send_email",
    {
      description:
        "Send text with optional HTML and staged attachments from an allowed active mailbox.",
      inputSchema: {
        from: z.string().email(),
        to: recipientList.min(1),
        cc: recipientList.default([]),
        bcc: recipientList.default([]),
        subject: z.string().trim().min(1).max(200),
        text: z.string().trim().min(1).max(100_000),
        html: z.string().trim().max(200_000).optional(),
        attachmentIds,
        draftId: z.string().min(1).max(100).optional()
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    (input) =>
      toolResult(async () => {
        await enforceSendRateLimit(env, principal.userId);
        const parsed = parseWith(sendMessageSchema, input);
        const mailboxId = await requireSendingAccess(env, principal, parsed.from);
        await requireDraftIdAccess(env, principal, parsed.draftId);
        await requireDraftAttachmentIdsAccess(env, principal, parsed.attachmentIds);
        const message = await sendNewMessage(env, parsed, principal.userId);
        await recordSend(env, principal, "mcp.message.send", mailboxId);
        return message;
      })
  );

  server.registerTool(
    "reply_to_message",
    {
      description:
        "Reply with text, optional HTML, recipients, and staged attachments from an allowed mailbox.",
      inputSchema: {
        from: z.string().email(),
        messageId: z.string().min(1).max(100),
        to: recipientList.min(1).optional(),
        cc: recipientList.default([]),
        bcc: recipientList.default([]),
        text: z.string().trim().min(1).max(100_000),
        html: z.string().trim().max(200_000).optional(),
        attachmentIds,
        draftId: z.string().min(1).max(100).optional()
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    (input) =>
      toolResult(async () => {
        await enforceSendRateLimit(env, principal.userId);
        const parsed = parseWith(replyMessageSchema, input);
        await requireSourceAccess(env, principal, parsed.messageId);
        const mailboxId = await requireSendingAccess(env, principal, parsed.from);
        await requireDraftIdAccess(env, principal, parsed.draftId);
        await requireDraftAttachmentIdsAccess(env, principal, parsed.attachmentIds);
        const message = await replyToMessage(env, parsed, principal.userId);
        await recordSend(env, principal, "mcp.message.reply", mailboxId);
        return message;
      })
  );

  server.registerTool(
    "forward_message",
    {
      description:
        "Forward one permitted message with optional note, HTML, staged, and original attachments.",
      inputSchema: {
        messageId: z.string().min(1).max(100),
        from: z.string().email(),
        to: recipientList.min(1),
        cc: recipientList.default([]),
        bcc: recipientList.default([]),
        subject: z.string().trim().min(1).max(200).optional(),
        text: z.string().trim().max(100_000).default(""),
        html: z.string().trim().max(200_000).optional(),
        attachmentIds,
        includeOriginalAttachments: z.boolean().default(true)
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    (input) =>
      toolResult(async () => {
        await enforceSendRateLimit(env, principal.userId);
        const parsed = parseWith(forwardMessageSchema, input);
        await requireSourceAccess(env, principal, parsed.messageId);
        const mailboxId = await requireSendingAccess(env, principal, parsed.from);
        await requireDraftAttachmentIdsAccess(env, principal, parsed.attachmentIds);
        const message = await forwardMessage(env, parsed, principal.userId);
        await recordSend(env, principal, "mcp.message.forward", mailboxId);
        return message;
      })
  );
}

async function requireSendingAccess(
  env: WorkerEnv,
  principal: McpPrincipal,
  from: string
): Promise<string> {
  const mailbox = await findMailboxForSending(env.DB, from);
  if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
  await requireMailboxAccess(env.DB, principal.userId, principal.role, mailbox.id, "agent");
  return mailbox.id;
}

async function requireSourceAccess(
  env: WorkerEnv,
  principal: McpPrincipal,
  messageId: string
): Promise<void> {
  await requireMailboxAccess(
    env.DB,
    principal.userId,
    principal.role,
    await getMessageMailboxId(env.DB, messageId),
    "agent"
  );
}

function enforceSendRateLimit(env: WorkerEnv, userId: string): Promise<void> {
  return enforceRateLimit(env.DB, env.BETTER_AUTH_SECRET, {
    scope: "mcp.mail.send",
    subject: userId,
    limit: 60,
    windowSeconds: 60
  });
}

function recordSend(env: WorkerEnv, principal: McpPrincipal, action: string, mailboxId: string) {
  return recordAudit(env.DB, {
    correlationId: crypto.randomUUID(),
    actorType: "user",
    actorId: principal.userId,
    action,
    resourceType: "mailbox",
    resourceId: mailboxId,
    outcome: "success"
  });
}
