import { Hono } from "hono";

import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";

import type { MessageAction } from "./actions";
import { findAttachment, getMessageDetail, listMessages, updateMessageAction } from "./queries";

export const messageRoutes = new Hono<HonoApp>();

const actions: readonly MessageAction[] = ["read", "unread", "star", "unstar", "archive", "trash"];

messageRoutes.get("/", async (c) => {
  await requireAuthContext(c.env, c.req.raw);
  return c.json(
    await listMessages(c.env.DB, {
      folder: c.req.query("folder"),
      mailboxId: c.req.query("mailboxId"),
      search: c.req.query("search")
    })
  );
});

messageRoutes.get("/:id", async (c) => {
  await requireAuthContext(c.env, c.req.raw);
  const message = await getMessageDetail(c.env.DB, c.req.param("id"));
  if (!message) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }
  return c.json(message);
});

for (const action of actions) {
  messageRoutes.post(`/:id/${action}`, async (c) => {
    await requireAuthContext(c.env, c.req.raw);
    return c.json(await updateMessageAction(c.env.DB, c.req.param("id"), action));
  });
}

export const attachmentRoutes = new Hono<HonoApp>();

attachmentRoutes.get("/:id", async (c) => {
  await requireAuthContext(c.env, c.req.raw);
  const attachment = await findAttachment(c.env.DB, c.req.param("id"));
  if (!attachment) {
    throw new AppError("ATTACHMENT_NOT_FOUND", "Attachment not found.", 404);
  }

  const object = await c.env.MAIL_OBJECTS.get(attachment.r2Key);
  if (!object) {
    throw new AppError("ATTACHMENT_OBJECT_NOT_FOUND", "Attachment object not found.", 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", attachment.contentType);
  headers.set("content-disposition", `attachment; filename="${attachment.filename}"`);
  return new Response(object.body, { headers });
});
