import { Hono } from "hono";

import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";

import type { MessageAction } from "./actions";
import { sanitizeMessageHtml } from "./html-sanitizer";
import {
  findAttachment,
  getMessageDetail,
  getMessageHtmlKey,
  listMessages,
  updateMessageAction
} from "./queries";
import { isRemoteMediaTrusted, trustRemoteMediaSender } from "./remote-media";

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

messageRoutes.get("/:id/html", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const message = await getMessageDetail(c.env.DB, c.req.param("id"));
  if (!message) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }
  const htmlKey = await getMessageHtmlKey(c.env.DB, message.id);
  if (!htmlKey) {
    throw new AppError("MESSAGE_HTML_NOT_FOUND", "HTML body not found.", 404);
  }
  const object = await c.env.MAIL_OBJECTS.get(htmlKey);
  if (!object) {
    throw new AppError("MESSAGE_HTML_OBJECT_NOT_FOUND", "HTML body not found.", 404);
  }
  const trusted =
    message.direction === "outbound" ||
    (await isRemoteMediaTrusted(c.env.DB, auth.user.id, message.fromAddress));
  const rendered = sanitizeMessageHtml({
    allowRemoteImages: trusted || c.req.query("loadRemoteImages") === "1",
    attachments: message.attachments,
    html: await object.text(),
    messageId: message.id,
    origin: new URL(c.req.url).origin
  });
  return c.json({ ...rendered, remoteMediaTrusted: trusted });
});

messageRoutes.post("/:id/remote-media/trust", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const message = await getMessageDetail(c.env.DB, c.req.param("id"));
  if (!message) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }
  await trustRemoteMediaSender(c.env.DB, auth.user.id, message.fromAddress);
  return c.json({ remoteMediaTrusted: true });
});

messageRoutes.get("/:id/inline/:attachmentId", async (c) => {
  await requireAuthContext(c.env, c.req.raw);
  const attachment = await findAttachment(c.env.DB, c.req.param("attachmentId"));
  if (!attachment || attachment.messageId !== c.req.param("id")) {
    throw new AppError("ATTACHMENT_NOT_FOUND", "Attachment not found.", 404);
  }
  if (!isSafeInlineImage(attachment.contentType)) {
    throw new AppError("INLINE_MEDIA_UNSUPPORTED", "Attachment cannot be displayed inline.", 415);
  }
  const object = await c.env.MAIL_OBJECTS.get(attachment.r2Key);
  if (!object) {
    throw new AppError("ATTACHMENT_OBJECT_NOT_FOUND", "Attachment object not found.", 404);
  }
  return new Response(object.body, {
    headers: {
      "cache-control": "private, max-age=86400",
      "content-disposition": "inline",
      "content-security-policy": "sandbox; default-src 'none'",
      "content-type": normalizedContentType(attachment.contentType),
      "x-content-type-options": "nosniff"
    }
  });
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

export function isSafeInlineImage(contentType: string): boolean {
  return ["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"].includes(
    normalizedContentType(contentType)
  );
}

function normalizedContentType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "application/octet-stream";
}
