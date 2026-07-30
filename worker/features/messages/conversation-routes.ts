import { Hono } from "hono";
import { z } from "zod";

import { accessibleMailboxIds, requireMailboxAccess } from "../../auth/mailbox-access";
import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { parseWith } from "../../lib/validation";

import type { MessageAction } from "./actions";
import { listConversationPage, updateConversationAction } from "./conversation-queries";
import { getMessageMailboxId } from "./queries";
import { conversationFolders } from "./types";

export const conversationRoutes = new Hono<HonoApp>();

const actions: readonly MessageAction[] = ["read", "unread", "star", "unstar", "archive", "trash"];
const folderSchema = z.enum(conversationFolders);
const cursorSchema = z.string().min(1).max(512).optional();
const actionBodySchema = z.object({ folder: folderSchema });

conversationRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const mailboxIds = await accessibleMailboxIds(c.env.DB, auth.user.id, auth.user.role, "read");
  const folder = parseWith(folderSchema.optional(), c.req.query("folder"));
  return c.json(
    await listConversationPage(c.env.DB, {
      cursor: parseWith(cursorSchema, c.req.query("cursor")),
      folder,
      mailboxId: c.req.query("mailboxId"),
      search: c.req.query("search"),
      mailboxIds
    })
  );
});

for (const action of actions) {
  conversationRoutes.post(`/:id/${action}`, async (c) => {
    const auth = await requireAuthContext(c.env, c.req.raw);
    const requiredAccess = action === "read" || action === "unread" ? "read" : "agent";
    await requireMailboxAccess(
      c.env.DB,
      auth.user.id,
      auth.user.role,
      await getMessageMailboxId(c.env.DB, c.req.param("id")),
      requiredAccess
    );
    const mailboxIds = await accessibleMailboxIds(
      c.env.DB,
      auth.user.id,
      auth.user.role,
      requiredAccess
    );
    const body = parseWith(actionBodySchema, await c.req.json<unknown>().catch(() => ({})));
    return c.json(
      await updateConversationAction(c.env.DB, {
        action,
        activeFolder: body.folder,
        mailboxIds,
        messageId: c.req.param("id")
      })
    );
  });
}
