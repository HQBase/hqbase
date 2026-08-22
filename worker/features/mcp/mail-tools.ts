import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { accessibleMessageScope } from "../../auth/mailbox-access";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { recordAudit } from "../audit/service";
import {
  ignoreMailEventFailure,
  messageEventTarget,
  publishMessageMailEvent
} from "../events/service";
import { listMailboxesForUser } from "../mailboxes/queries";
import { requireAttachmentAccess, requireMessageAccess } from "../messages/access";
import { listConversations, updateConversationAction } from "../messages/conversation-queries";
import { publicMessage } from "../messages/public-message";
import {
  findAttachment,
  getMessageDetail,
  listMessages,
  listThreadMessages,
  updateMessageAction
} from "../messages/queries";
import { conversationFolders } from "../messages/types";

import type { McpPrincipal } from "./route";
import { attachmentResult, toolResult } from "./tool-result";

const messageActionSchema = z.enum([
  "read",
  "unread",
  "star",
  "unstar",
  "archive",
  "unarchive",
  "trash",
  "restore"
]);
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
        const scope = await accessibleMessageScope(
          env.DB,
          principal.userId,
          principal.role,
          "read"
        );
        return listMessages(env.DB, {
          folder: input.folder,
          mailboxId: input.mailboxId,
          scope,
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
        const scope = await accessibleMessageScope(
          env.DB,
          principal.userId,
          principal.role,
          "read"
        );
        return listConversations(env.DB, {
          folder: input.folder,
          mailboxId: input.mailboxId,
          scope,
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
        const scope = await accessibleMessageScope(
          env.DB,
          principal.userId,
          principal.role,
          "read"
        );
        return Promise.all(
          (await listThreadMessages(env.DB, message.threadId, scope)).map(publicMessage)
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
        await requireAttachmentAccess(
          env.DB,
          principal.userId,
          principal.role,
          attachmentId,
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
      description:
        "Change read, starred, archived, unarchived, trash, or restored state for one message.",
      inputSchema: {
        action: messageActionSchema,
        messageId: z.string().min(1).max(100)
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    ({ action, messageId }) =>
      toolResult(async () => {
        await requireMessageAccess(env.DB, principal.userId, principal.role, messageId, "agent");
        const message = await updateMessageAction(env.DB, messageId, action);
        const target = await messageEventTarget(env.DB, message.id);
        if (target) {
          await ignoreMailEventFailure(publishMessageMailEvent(env, [target]));
        }
        await recordMutation(env, principal, `mcp.message.${action}`, "message", messageId);
        return message;
      })
  );

  server.registerTool(
    "update_conversation",
    {
      description:
        "Change read, starred, archived, unarchived, trash, or restored state across one conversation.",
      inputSchema: {
        action: messageActionSchema,
        activeFolder: conversationFolderSchema,
        messageId: z.string().min(1).max(100)
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    ({ action, activeFolder, messageId }) =>
      toolResult(async () => {
        await requireMessageAccess(env.DB, principal.userId, principal.role, messageId, "agent");
        const scope = await accessibleMessageScope(
          env.DB,
          principal.userId,
          principal.role,
          "agent"
        );
        const { eventTargets, ...result } = await updateConversationAction(env.DB, {
          action,
          activeFolder,
          messageId,
          scope
        });
        if (eventTargets.length > 0) {
          await ignoreMailEventFailure(publishMessageMailEvent(env, eventTargets));
        }
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
  await requireMessageAccess(env.DB, principal.userId, principal.role, messageId, "read");
  const message = await getMessageDetail(env.DB, messageId);
  if (!message) throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  return publicMessage(message);
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
