import { Hono } from "hono";
import { z } from "zod";
import { includeMailApiLabels, requireMailApiPrincipal } from "../../auth/mail-api";
import { accessibleMessageScope } from "../../auth/mailbox-access";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { parseWith } from "../../lib/validation";
import { ignoreMailEventFailure, publishMessageMailEvent } from "../events/service";
import {
  labelsForThreadIds,
  requireLabel,
  setConversationLabel,
  withConversationLabels
} from "../labels/queries";
import { requireMessageAccess } from "./access";
import type { MessageAction } from "./actions";
import { listConversationPage, updateConversationAction } from "./conversation-queries";
import { conversationFolders } from "./types";

export const conversationRoutes = new Hono<HonoApp>();

const actions: readonly MessageAction[] = [
  "read",
  "unread",
  "star",
  "unstar",
  "archive",
  "unarchive",
  "trash",
  "restore"
];
const folderSchema = z.enum(conversationFolders);
const cursorSchema = z.string().min(1).max(512).optional();
const actionBodySchema = z.object({ folder: folderSchema });

conversationRoutes.get("/", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:read");
  const labelId = c.req.query("labelId");
  const labelIds = [
    ...new Set([...(labelId === undefined ? [] : [labelId]), ...(c.req.queries("labelIds") ?? [])])
  ];
  await Promise.all(labelIds.map((id) => requireLabel(c.env.DB, id)));
  const scope = await accessibleMessageScope(
    c.env.DB,
    auth.principal.id,
    auth.principal.role,
    "read"
  );
  const folder = parseWith(folderSchema.optional(), c.req.query("folder"));
  const page = await listConversationPage(c.env.DB, {
    cursor: parseWith(cursorSchema, c.req.query("cursor")),
    folder,
    labelIds,
    mailboxId: c.req.query("mailboxId"),
    search: c.req.query("search"),
    scope
  });
  return c.json({
    ...page,
    conversations: !includeMailApiLabels(c.req.raw)
      ? page.conversations
      : await withConversationLabels(c.env.DB, page.conversations, scope)
  });
});

for (const action of actions) {
  conversationRoutes.post(`/:id/${action}`, async (c) => {
    const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:write");
    const requiredAccess = action === "read" || action === "unread" ? "read" : "agent";
    await requireMessageAccess(
      c.env.DB,
      auth.principal.id,
      auth.principal.role,
      c.req.param("id"),
      requiredAccess
    );
    const scope = await accessibleMessageScope(
      c.env.DB,
      auth.principal.id,
      auth.principal.role,
      requiredAccess
    );
    const body = parseWith(actionBodySchema, await c.req.json<unknown>().catch(() => ({})));
    const { eventTargets, ...result } = await updateConversationAction(c.env.DB, {
      action,
      activeFolder: body.folder,
      messageId: c.req.param("id"),
      scope
    });
    if (eventTargets.length > 0) {
      c.executionCtx.waitUntil(
        ignoreMailEventFailure(publishMessageMailEvent(c.env, eventTargets))
      );
    }
    return c.json(result);
  });
}

for (const [method, assigned] of [
  ["put", true],
  ["delete", false]
] as const) {
  conversationRoutes[method]("/:id/labels/:labelId", async (c) => {
    const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:write");
    const label = await requireLabel(c.env.DB, c.req.param("labelId"));
    await requireConversationLabelAccess(
      c.env.DB,
      auth.principal.id,
      auth.principal.role,
      c.req.param("id")
    );
    const scope = await accessibleMessageScope(
      c.env.DB,
      auth.principal.id,
      auth.principal.role,
      "agent"
    );
    const result = await setConversationLabel(c.env.DB, {
      assigned,
      labelId: label.id,
      messageId: c.req.param("id"),
      principalId: auth.principal.id,
      scope
    });
    if (result.eventTargets.length > 0) {
      c.executionCtx.waitUntil(
        ignoreMailEventFailure(publishMessageMailEvent(c.env, result.eventTargets))
      );
    }
    const current = await labelsForThreadIds(c.env.DB, [result.threadId], scope);
    return c.json({
      affected: result.affected,
      assigned,
      labelId: label.id,
      labels: current.get(result.threadId) ?? [],
      threadId: result.threadId
    });
  });
}

async function requireConversationLabelAccess(
  db: D1Database,
  principalId: string,
  role: Parameters<typeof requireMessageAccess>[2],
  messageId: string
): Promise<void> {
  try {
    await requireMessageAccess(db, principalId, role, messageId, "agent");
  } catch (error) {
    if (error instanceof AppError && error.code === "MAILBOX_FORBIDDEN") {
      throw new AppError("LABEL_FORBIDDEN", "You cannot label this conversation.", 403);
    }
    throw error;
  }
}
