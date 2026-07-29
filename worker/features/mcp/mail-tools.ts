import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { accessibleMailboxIds, requireMailboxAccess } from "../../auth/mailbox-access";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { recordAudit } from "../audit/service";
import { listMailboxesForUser } from "../mailboxes/queries";
import { listConversations, updateConversationAction } from "../messages/conversation-queries";
import {
  findAttachment,
  getAttachmentMailboxId,
  getMessageDetail,
  getMessageMailboxId,
  listMessages,
  listThreadMessages,
  updateMessageAction
} from "../messages/queries";
import { conversationFolders } from "../messages/types";

import type { McpPrincipal } from "./route";
import { attachmentResult, toolResult } from "./tool-result";

const messageActionSchema = z.enum(["read", "unread", "star", "unstar", "archive", "trash"]);
const conversationFolderSchema = z.enum(conversationFolders);

export function registerMailTools(
  server: McpServer,
  env: WorkerEnv,
  principal: McpPrincipal
): void {
  if (principal.scopes.has("mail:read")) registerReadTools(server, env, principal);
  if (principal.scopes.has("mail:write")) registerWriteTools(server, env, principal);
}

function registerReadTools(server: McpServer, env: WorkerEnv, principal: McpPrincipal): void {
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
        "Search recent individual messages across mailboxes where the user has read access.",
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
    "list_conversations",
    {
      description:
        "List recent mailbox conversations with aggregate unread, star, attachment, and count state.",
      inputSchema: {
        folder: conversationFolderSchema.optional(),
        mailboxId: z.string().min(1).max(100).optional(),
        query: z.string().trim().min(1).max(200).optional()
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
        return listConversations(env.DB, {
          folder: input.folder,
          mailboxId: input.mailboxId,
          mailboxIds,
          search: input.query
        });
      })
  );

  server.registerTool(
    "get_message",
    {
      description: "Open one permitted message as plain text with safe attachment metadata.",
      inputSchema: { messageId: z.string().min(1).max(100) },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ messageId }) => toolResult(() => readMessage(env, principal, messageId))
  );

  server.registerTool(
    "get_thread",
    {
      description: "Open the permitted chronological conversation containing one message.",
      inputSchema: { messageId: z.string().min(1).max(100) },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ messageId }) =>
      toolResult(async () => {
        const message = await readMessage(env, principal, messageId);
        const mailboxIds = await accessibleMailboxIds(
          env.DB,
          principal.userId,
          principal.role,
          "read"
        );
        return Promise.all(
          (await listThreadMessages(env.DB, message.threadId, mailboxIds)).map(safeMessage)
        );
      })
  );

  server.registerTool(
    "get_attachment",
    {
      description: "Download one permitted attachment as a bounded MCP embedded resource.",
      inputSchema: { attachmentId: z.string().min(1).max(100) },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    ({ attachmentId }) =>
      attachmentResult(async () => {
        await requireMailboxAccess(
          env.DB,
          principal.userId,
          principal.role,
          await getAttachmentMailboxId(env.DB, attachmentId),
          "read"
        );
        const attachment = await findAttachment(env.DB, attachmentId);
        if (!attachment) {
          throw new AppError("ATTACHMENT_NOT_FOUND", "Attachment not found.", 404);
        }
        const object = await env.MAIL_OBJECTS.get(attachment.r2Key);
        if (!object) {
          throw new AppError("ATTACHMENT_OBJECT_NOT_FOUND", "Attachment object not found.", 404);
        }
        return { attachment, object };
      })
  );
}

function registerWriteTools(server: McpServer, env: WorkerEnv, principal: McpPrincipal): void {
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
        await requireMailboxAccess(
          env.DB,
          principal.userId,
          principal.role,
          await getMessageMailboxId(env.DB, messageId),
          "agent"
        );
        const message = await updateMessageAction(env.DB, messageId, action);
        await recordMutation(env, principal, `mcp.message.${action}`, "message", messageId);
        return message;
      })
  );

  server.registerTool(
    "update_conversation",
    {
      description:
        "Change read, starred, archived, or trash state across one permitted conversation.",
      inputSchema: {
        action: messageActionSchema,
        activeFolder: conversationFolderSchema,
        messageId: z.string().min(1).max(100)
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    ({ action, activeFolder, messageId }) =>
      toolResult(async () => {
        await requireMailboxAccess(
          env.DB,
          principal.userId,
          principal.role,
          await getMessageMailboxId(env.DB, messageId),
          "agent"
        );
        const mailboxIds = await accessibleMailboxIds(
          env.DB,
          principal.userId,
          principal.role,
          "agent"
        );
        const result = await updateConversationAction(env.DB, {
          action,
          activeFolder,
          mailboxIds,
          messageId
        });
        await recordMutation(
          env,
          principal,
          `mcp.conversation.${action}`,
          "conversation",
          result.threadId
        );
        return result;
      })
  );
}

async function readMessage(env: WorkerEnv, principal: McpPrincipal, messageId: string) {
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
}

function safeMessage(message: NonNullable<Awaited<ReturnType<typeof getMessageDetail>>>) {
  return {
    ...message,
    attachments: message.attachments.map(({ r2Key: _r2Key, ...attachment }) => attachment)
  };
}

function recordMutation(
  env: WorkerEnv,
  principal: McpPrincipal,
  action: string,
  resourceType: string,
  resourceId: string
) {
  return recordAudit(env.DB, {
    correlationId: crypto.randomUUID(),
    actorType: "user",
    actorId: principal.userId,
    action,
    resourceType,
    resourceId,
    outcome: "success"
  });
}
