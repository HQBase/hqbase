import { Hono } from "hono";
import { z } from "zod";
import { requireMailApiContext } from "../../auth/mail-api";
import { accessibleMessageScope } from "../../auth/mailbox-access";
import type { HonoApp } from "../../lib/env";
import { parseWith } from "../../lib/validation";
import { ignoreMailEventFailure, publishMessageMailEvent } from "../events/service";
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
  const auth = await requireMailApiContext(c.env, c.req.raw, "mail:read");
  const scope = await accessibleMessageScope(c.env.DB, auth.user.id, auth.user.role, "read");
  const folder = parseWith(folderSchema.optional(), c.req.query("folder"));
  return c.json(
    await listConversationPage(c.env.DB, {
      cursor: parseWith(cursorSchema, c.req.query("cursor")),
      folder,
      mailboxId: c.req.query("mailboxId"),
      search: c.req.query("search"),
      scope
    })
  );
});

for (const action of actions) {
  conversationRoutes.post(`/:id/${action}`, async (c) => {
    const auth = await requireMailApiContext(c.env, c.req.raw, "mail:write");
    const requiredAccess = action === "read" || action === "unread" ? "read" : "agent";
    await requireMessageAccess(
      c.env.DB,
      auth.user.id,
      auth.user.role,
      c.req.param("id"),
      requiredAccess
    );
    const scope = await accessibleMessageScope(
      c.env.DB,
      auth.user.id,
      auth.user.role,
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
