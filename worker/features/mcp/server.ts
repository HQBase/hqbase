import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

import { accessibleMailboxIds, requireMailboxAccess } from "../../auth/mailbox-access";
import type { WorkerEnv } from "../../lib/env";
import { AppError, toAppError } from "../../lib/errors";
import { parseWith } from "../../lib/validation";
import { enforceRateLimit } from "../../security/rate-limit";
import { recordAudit } from "../audit/service";
import { findMailboxForSending, listMailboxesForUser } from "../mailboxes/queries";
import {
  getMessageDetail,
  getMessageMailboxId,
  listMessages,
  updateMessageAction
} from "../messages/queries";
import { replyToMessage, sendNewMessage } from "../send/service";
import { replyMessageSchema, sendMessageSchema } from "../send/validation";
import type { McpPrincipal } from "./route";

const messageActionSchema = z.enum(["read", "unread", "star", "unstar", "archive", "trash"]);

export async function serveMcp(
  request: Request,
  env: WorkerEnv,
  _ctx: ExecutionContext,
  principal: McpPrincipal
): Promise<Response> {
  const server = new McpServer({ name: "HQBase", version: "1.0.0" });
  registerTools(server, env, principal);
  const url = new URL(request.url);
  const transport = new WebStandardStreamableHTTPServerTransport({
    allowedOrigins: [url.origin],
    enableDnsRebindingProtection: true,
    enableJsonResponse: true
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

function registerTools(server: McpServer, env: WorkerEnv, principal: McpPrincipal): void {
  if (principal.scopes.has("mail:read")) {
    server.registerTool(
      "list_mailboxes",
      {
        description: "List only mailboxes currently visible to the connected user.",
        annotations: { readOnlyHint: true, openWorldHint: false }
      },
      () =>
        toolResult(async () => {
          const mailboxes = await listMailboxesForUser(env.DB, principal.userId, principal.role);
          return mailboxes.filter((mailbox) => mailbox.accessLevel !== null);
        })
    );

    server.registerTool(
      "search_messages",
      {
        description:
          "Search recent messages across mailboxes where the connected user has read access.",
        inputSchema: {
          folder: z.enum(["inbox", "sent", "archived", "trash", "catchall"]).optional(),
          mailboxId: z.string().min(1).max(100).optional(),
          query: z.string().trim().min(1).max(200).optional(),
          limit: z.number().int().min(1).max(100).default(25)
        },
        annotations: { readOnlyHint: true, openWorldHint: false }
      },
      (input) =>
        toolResult(async () => {
          const mailboxIds = await accessibleMailboxIds(
            env.DB,
            principal.userId,
            principal.role,
            "read"
          );
          return listMessages(env.DB, {
            folder: input.folder,
            mailboxId: input.mailboxId,
            mailboxIds,
            search: input.query,
            limit: input.limit
          });
        })
    );

    server.registerTool(
      "get_message",
      {
        description:
          "Open one permitted message as stored plain text with safe attachment metadata.",
        inputSchema: { messageId: z.string().min(1).max(100) },
        annotations: { readOnlyHint: true, openWorldHint: false }
      },
      ({ messageId }) =>
        toolResult(async () => {
          await requireMailboxAccess(
            env.DB,
            principal.userId,
            principal.role,
            await getMessageMailboxId(env.DB, messageId),
            "read"
          );
          const message = await getMessageDetail(env.DB, messageId);
          if (!message) throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
          return safeMessage(message);
        })
    );
  }

  if (principal.scopes.has("mail:write")) {
    server.registerTool(
      "update_message",
      {
        description: "Change read, starred, archived, or trash state for one permitted message.",
        inputSchema: {
          action: messageActionSchema,
          messageId: z.string().min(1).max(100)
        },
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false }
      },
      ({ action, messageId }) =>
        toolResult(async () => {
          const mailboxId = await getMessageMailboxId(env.DB, messageId);
          await requireMailboxAccess(env.DB, principal.userId, principal.role, mailboxId, "agent");
          const message = await updateMessageAction(env.DB, messageId, action);
          await recordAudit(env.DB, {
            correlationId: crypto.randomUUID(),
            actorType: "user",
            actorId: principal.userId,
            action: `mcp.message.${action}`,
            resourceType: "message",
            resourceId: messageId,
            outcome: "success"
          });
          return message;
        })
    );
  }

  if (principal.scopes.has("mail:send")) {
    server.registerTool(
      "send_email",
      {
        description: "Send a plain-text email from a mailbox where the user has agent access.",
        inputSchema: {
          from: z.string().email(),
          to: z.array(z.string().email()).min(1).max(50),
          cc: z.array(z.string().email()).max(50).default([]),
          bcc: z.array(z.string().email()).max(50).default([]),
          subject: z.string().trim().min(1).max(200),
          text: z.string().trim().min(1).max(100_000)
        },
        annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true }
      },
      (input) =>
        toolResult(async () => {
          await enforceSendRateLimit(env, principal.userId);
          const parsed = parseWith(sendMessageSchema, { ...input, html: undefined });
          const mailbox = await findMailboxForSending(env.DB, parsed.from);
          if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
          await requireMailboxAccess(env.DB, principal.userId, principal.role, mailbox.id, "agent");
          const message = await sendNewMessage(env, parsed, principal.userId);
          await recordAudit(env.DB, {
            correlationId: crypto.randomUUID(),
            actorType: "user",
            actorId: principal.userId,
            action: "mcp.message.send",
            resourceType: "mailbox",
            resourceId: mailbox.id,
            outcome: "success"
          });
          return message;
        })
    );

    server.registerTool(
      "reply_to_message",
      {
        description: "Reply in plain text from a mailbox where the user has agent access.",
        inputSchema: {
          from: z.string().email(),
          messageId: z.string().min(1).max(100),
          to: z.array(z.string().email()).min(1).max(50).optional(),
          cc: z.array(z.string().email()).max(50).default([]),
          bcc: z.array(z.string().email()).max(50).default([]),
          text: z.string().trim().min(1).max(100_000)
        },
        annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true }
      },
      (input) =>
        toolResult(async () => {
          await enforceSendRateLimit(env, principal.userId);
          const parsed = parseWith(replyMessageSchema, { ...input, html: undefined });
          await requireMailboxAccess(
            env.DB,
            principal.userId,
            principal.role,
            await getMessageMailboxId(env.DB, parsed.messageId),
            "agent"
          );
          const mailbox = await findMailboxForSending(env.DB, parsed.from);
          if (!mailbox) throw new AppError("MAILBOX_NOT_FOUND", "Sending mailbox not found.", 404);
          await requireMailboxAccess(env.DB, principal.userId, principal.role, mailbox.id, "agent");
          const message = await replyToMessage(env, parsed, principal.userId);
          await recordAudit(env.DB, {
            correlationId: crypto.randomUUID(),
            actorType: "user",
            actorId: principal.userId,
            action: "mcp.message.reply",
            resourceType: "mailbox",
            resourceId: mailbox.id,
            outcome: "success"
          });
          return message;
        })
    );
  }
}

function enforceSendRateLimit(env: WorkerEnv, userId: string): Promise<void> {
  return enforceRateLimit(env.DB, env.BETTER_AUTH_SECRET, {
    scope: "mcp.mail.send",
    subject: userId,
    limit: 60,
    windowSeconds: 60
  });
}

async function toolResult(run: () => Promise<unknown>) {
  try {
    const value = await run();
    return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
  } catch (error) {
    const appError = toAppError(error);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: { code: appError.code, message: appError.message } })
        }
      ],
      isError: true
    };
  }
}

function safeMessage(message: Awaited<ReturnType<typeof getMessageDetail>>) {
  if (!message) return null;
  return {
    ...message,
    attachments: message.attachments.map(({ r2Key: _r2Key, ...attachment }) => attachment)
  };
}
