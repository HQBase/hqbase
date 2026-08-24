import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { accessibleMessageScope } from "../../auth/mailbox-access";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { recordAudit } from "../audit/service";
import {
  type MailEventScheduler,
  publishMessageMailEvent,
  scheduleMailEvent
} from "../events/service";
import {
  labelsForMessageIds,
  labelsForThreadIds,
  listLabels,
  requireLabel,
  setConversationLabel,
  setMessageLabel
} from "../labels/queries";
import { requireMessageAccess } from "../messages/access";

import type { McpPrincipal } from "./route";
import { toolResult } from "./tool-result";

export function registerLabelReadTool(server: McpServer, env: WorkerEnv): void {
  server.registerTool(
    "list_labels",
    {
      description:
        "List shared labels. Labels organize mail but never change mailbox access or folders.",
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    () => toolResult(() => listLabels(env.DB))
  );
}

export function registerLabelWriteTools(
  server: McpServer,
  env: WorkerEnv,
  principal: McpPrincipal,
  schedule: MailEventScheduler
): void {
  registerLabelMutationTool(server, env, principal, schedule, "add_label", true);
  registerLabelMutationTool(server, env, principal, schedule, "remove_label", false);
}

function registerLabelMutationTool(
  server: McpServer,
  env: WorkerEnv,
  principal: McpPrincipal,
  schedule: MailEventScheduler,
  name: "add_label" | "remove_label",
  assigned: boolean
): void {
  server.registerTool(
    name,
    {
      description: `${assigned ? "Add" : "Remove"} one shared label on a message or accessible conversation. Labels organize mail but never change mailbox access or folders.`,
      inputSchema: {
        labelId: z.string().min(1).max(100),
        messageId: z.string().min(1).max(100),
        target: z.enum(["message", "conversation"]).default("message")
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false }
    },
    ({ labelId, messageId, target }) =>
      toolResult(async () => {
        const label = await requireLabel(env.DB, labelId);
        await requireLabelAccess(env, principal, messageId);
        if (target === "message") {
          const result = await setMessageLabel(env.DB, {
            assigned,
            labelId: label.id,
            messageId,
            principalId: principal.userId
          });
          if (result.eventTargets.length > 0) {
            scheduleMailEvent(schedule, publishMessageMailEvent(env, result.eventTargets));
          }
          const current = await labelsForMessageIds(env.DB, [messageId]);
          await recordLabelMutation(env, principal, assigned, "message", messageId);
          return {
            affected: result.affected,
            assigned,
            labelId: label.id,
            labels: current.get(messageId) ?? [],
            messageId
          };
        }

        const scope = await accessibleMessageScope(
          env.DB,
          principal.userId,
          principal.role,
          "agent"
        );
        const result = await setConversationLabel(env.DB, {
          assigned,
          labelId: label.id,
          messageId,
          principalId: principal.userId,
          scope
        });
        if (result.eventTargets.length > 0) {
          scheduleMailEvent(schedule, publishMessageMailEvent(env, result.eventTargets));
        }
        const current = await labelsForThreadIds(env.DB, [result.threadId], scope);
        await recordLabelMutation(env, principal, assigned, "conversation", result.threadId);
        return {
          affected: result.affected,
          assigned,
          labelId: label.id,
          labels: current.get(result.threadId) ?? [],
          threadId: result.threadId
        };
      })
  );
}

async function requireLabelAccess(
  env: WorkerEnv,
  principal: McpPrincipal,
  messageId: string
): Promise<void> {
  try {
    await requireMessageAccess(env.DB, principal.userId, principal.role, messageId, "agent");
  } catch (error) {
    if (error instanceof AppError && error.code === "MAILBOX_FORBIDDEN") {
      throw new AppError("LABEL_FORBIDDEN", "You cannot label this mail.", 403);
    }
    throw error;
  }
}

function recordLabelMutation(
  env: WorkerEnv,
  principal: McpPrincipal,
  assigned: boolean,
  resourceType: "message" | "conversation",
  resourceId: string
) {
  return recordAudit(env.DB, {
    correlationId: crypto.randomUUID(),
    actorType: "user",
    actorId: principal.userId,
    action: `mcp.label.${assigned ? "add" : "remove"}`,
    resourceType,
    resourceId,
    outcome: "success"
  });
}
