import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { WorkerEnv } from "../../lib/env";
import { AppError, toAppError } from "../../lib/errors";
import { parseWith } from "../../lib/validation";
import { listMailboxes } from "../mailboxes/queries";
import { getMessageDetail, listMessages, updateMessageAction } from "../messages/queries";
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
  const server = new McpServer({ name: "HQBase Community", version: "1.0.0" });
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
        description:
          "List active and inactive shared mailboxes in this HQBase Community workspace.",
        annotations: { readOnlyHint: true, openWorldHint: false }
      },
      () => toolResult(async () => listMailboxes(env.DB))
    );

    server.registerTool(
      "search_messages",
      {
        description:
          "Search recent messages in shared mailboxes. Results are newest first and bounded.",
        inputSchema: {
          folder: z.enum(["inbox", "sent", "archived", "trash", "catchall"]).optional(),
          mailboxId: z.string().min(1).max(100).optional(),
          query: z.string().trim().min(1).max(200).optional(),
          limit: z.number().int().min(1).max(100).default(25)
        },
        annotations: { readOnlyHint: true, openWorldHint: false }
      },
      (input) =>
        toolResult(() =>
          listMessages(env.DB, {
            folder: input.folder,
            mailboxId: input.mailboxId,
            search: input.query,
            limit: input.limit
          })
        )
    );

    server.registerTool(
      "get_message",
      {
        description: "Open one message as stored plain text with safe attachment metadata.",
        inputSchema: { messageId: z.string().min(1).max(100) },
        annotations: { readOnlyHint: true, openWorldHint: false }
      },
      ({ messageId }) =>
        toolResult(async () => {
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
        description: "Change read, starred, archived, or trash state for one shared message.",
        inputSchema: {
          action: messageActionSchema,
          messageId: z.string().min(1).max(100)
        },
        annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false }
      },
      ({ action, messageId }) => toolResult(() => updateMessageAction(env.DB, messageId, action))
    );
  }

  if (principal.scopes.has("mail:send")) {
    server.registerTool(
      "send_email",
      {
        description: "Send a plain-text email from an active shared mailbox.",
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
        toolResult(() =>
          sendNewMessage(env, parseWith(sendMessageSchema, { ...input, html: undefined }))
        )
    );

    server.registerTool(
      "reply_to_message",
      {
        description: "Reply in plain text to one message from an active shared mailbox.",
        inputSchema: {
          from: z.string().email(),
          messageId: z.string().min(1).max(100),
          text: z.string().trim().min(1).max(100_000)
        },
        annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true }
      },
      (input) =>
        toolResult(() =>
          replyToMessage(env, parseWith(replyMessageSchema, { ...input, html: undefined }))
        )
    );
  }
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
