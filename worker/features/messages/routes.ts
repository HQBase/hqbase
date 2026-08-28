import { Hono } from "hono";
import { mailApiBasePath, requireMailApiPrincipal } from "../../auth/mail-api";
import { accessibleMessageScope } from "../../auth/mailbox-access";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import {
  ignoreMailEventFailure,
  messageEventTarget,
  publishMessageMailEvent
} from "../events/service";
import {
  labelsForMessageIds,
  requireLabel,
  setMessageLabel,
  withMessageLabels
} from "../labels/queries";
import { requireAttachmentAccess, requireMessageAccess } from "./access";
import type { MessageAction } from "./actions";
import { sanitizeMessageHtml } from "./html-sanitizer";
import { isSafeInlineImage, normalizedContentType } from "./inline-media";
import { publicMessage } from "./public-message";
import {
  defaultMessageLimit,
  findAttachment,
  getMessageDetail,
  getMessageHtmlKey,
  listMessagePage,
  listThreadMessages,
  maxMessageLimit,
  updateMessageAction
} from "./queries";
import { isRemoteMediaTrusted, trustRemoteMediaSender } from "./remote-media";

export { isSafeInlineImage } from "./inline-media";

export const messageRoutes = new Hono<HonoApp>();

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

messageRoutes.get("/", async (c) => {
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
  const limit = parseMessageLimit(c.req.query("limit"));
  const page = await listMessagePage(c.env.DB, {
    cursor: c.req.query("cursor"),
    folder: c.req.query("folder"),
    labelIds,
    limit,
    mailboxId: c.req.query("mailboxId"),
    search: c.req.query("search"),
    scope
  });

  const messages = includeLabels(c.req.raw)
    ? await withMessageLabels(c.env.DB, page.messages)
    : page.messages;
  const response = c.json(messages);
  if (page.nextCursor) {
    response.headers.set("link", `<${nextMessagePageUrl(c.req.url, page.nextCursor)}>; rel="next"`);
  }
  return response;
});

messageRoutes.get("/:id/thread", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:read");
  const message = await getMessageDetail(c.env.DB, c.req.param("id"));
  if (!message) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }
  await requireMessageAccess(c.env.DB, auth.principal.id, auth.principal.role, message.id, "read");
  const scope = await accessibleMessageScope(
    c.env.DB,
    auth.principal.id,
    auth.principal.role,
    "read"
  );
  const messages = (await listThreadMessages(c.env.DB, message.threadId, scope)).map(publicMessage);
  return c.json(includeLabels(c.req.raw) ? await withMessageLabels(c.env.DB, messages) : messages);
});

messageRoutes.get("/:id", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:read");
  await requireMessageAccess(
    c.env.DB,
    auth.principal.id,
    auth.principal.role,
    c.req.param("id"),
    "read"
  );
  const message = await getMessageDetail(c.env.DB, c.req.param("id"));
  if (!message) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }
  const publicDetail = publicMessage(message);
  return c.json(
    includeLabels(c.req.raw) ? (await withMessageLabels(c.env.DB, [publicDetail]))[0] : publicDetail
  );
});

messageRoutes.get("/:id/html", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:read");
  await requireMessageAccess(
    c.env.DB,
    auth.principal.id,
    auth.principal.role,
    c.req.param("id"),
    "read"
  );
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
    auth.principal.type === "user" &&
    (await isRemoteMediaTrusted(c.env.DB, auth.principal.id, message.fromAddress));
  const rendered = sanitizeMessageHtml({
    allowRemoteImages: trusted || c.req.query("loadRemoteImages") === "1",
    attachments: message.attachments,
    html: await object.text(),
    inlineBasePath: `${mailApiBasePath(c.req.raw) ?? "/api"}/messages`,
    messageId: message.id,
    origin: new URL(c.req.url).origin
  });
  return c.json({ ...rendered, remoteMediaTrusted: trusted });
});

messageRoutes.post("/:id/remote-media/trust", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:write");
  if (auth.principal.type !== "user") {
    throw new AppError(
      "AGENT_REMOTE_MEDIA_PREFERENCE_UNSUPPORTED",
      "Machine agents cannot change sender image preferences.",
      403
    );
  }
  await requireMessageAccess(
    c.env.DB,
    auth.principal.id,
    auth.principal.role,
    c.req.param("id"),
    "read"
  );
  const message = await getMessageDetail(c.env.DB, c.req.param("id"));
  if (!message) {
    throw new AppError("MESSAGE_NOT_FOUND", "Message not found.", 404);
  }
  await trustRemoteMediaSender(c.env.DB, auth.principal.id, message.fromAddress);
  return c.json({ remoteMediaTrusted: true });
});

messageRoutes.get("/:id/inline/:attachmentId", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:read");
  await requireAttachmentAccess(
    c.env.DB,
    auth.principal.id,
    auth.principal.role,
    c.req.param("attachmentId"),
    "read"
  );
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
    const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:write");
    await requireMessageAccess(
      c.env.DB,
      auth.principal.id,
      auth.principal.role,
      c.req.param("id"),
      action === "read" || action === "unread" ? "read" : "agent"
    );
    const message = await updateMessageAction(c.env.DB, c.req.param("id"), action);
    const target = await messageEventTarget(c.env.DB, message.id);
    if (target) {
      c.executionCtx.waitUntil(ignoreMailEventFailure(publishMessageMailEvent(c.env, [target])));
    }
    return c.json(
      includeLabels(c.req.raw) ? (await withMessageLabels(c.env.DB, [message]))[0] : message
    );
  });
}

for (const [method, assigned] of [
  ["put", true],
  ["delete", false]
] as const) {
  messageRoutes[method]("/:id/labels/:labelId", async (c) => {
    const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:write");
    const label = await requireLabel(c.env.DB, c.req.param("labelId"));
    await requireLabelMessageAccess(
      c.env.DB,
      auth.principal.id,
      auth.principal.role,
      c.req.param("id")
    );
    const result = await setMessageLabel(c.env.DB, {
      assigned,
      labelId: label.id,
      messageId: c.req.param("id"),
      principalId: auth.principal.id
    });
    if (result.eventTargets.length > 0) {
      c.executionCtx.waitUntil(
        ignoreMailEventFailure(publishMessageMailEvent(c.env, result.eventTargets))
      );
    }
    const current = await labelsForMessageIds(c.env.DB, [c.req.param("id")]);
    return c.json({
      affected: result.affected,
      assigned,
      labelId: label.id,
      labels: current.get(c.req.param("id")) ?? [],
      messageId: c.req.param("id")
    });
  });
}

export const attachmentRoutes = new Hono<HonoApp>();

attachmentRoutes.get("/:id", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:read");
  await requireAttachmentAccess(
    c.env.DB,
    auth.principal.id,
    auth.principal.role,
    c.req.param("id"),
    "read"
  );
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

/** Returns the requested page size, or throws INVALID_LIMIT when the value is not 1 to 100. */
function parseMessageLimit(value: string | undefined): number {
  if (value === undefined) {
    return defaultMessageLimit;
  }
  const limit = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isInteger(limit) || limit < 1 || limit > maxMessageLimit) {
    throw new AppError(
      "INVALID_LIMIT",
      `Limit must be an integer from 1 to ${maxMessageLimit}.`,
      400
    );
  }
  return limit;
}

/** Keeps list filters and the limit, and replaces the cursor. */
function nextMessagePageUrl(requestUrl: string, cursor: string): string {
  const url = new URL(requestUrl);
  const preserved = new URLSearchParams();
  for (const name of ["mailboxId", "folder", "labelId", "search", "limit"]) {
    const value = url.searchParams.get(name);
    if (value !== null) preserved.set(name, value);
  }
  for (const labelId of url.searchParams.getAll("labelIds")) {
    preserved.append("labelIds", labelId);
  }
  preserved.set("cursor", cursor);
  url.search = preserved.toString();
  return url.toString();
}

function includeLabels(request: Request): boolean {
  return mailApiBasePath(request) !== "/api/v1";
}

async function requireLabelMessageAccess(
  db: D1Database,
  principalId: string,
  role: Parameters<typeof requireMessageAccess>[2],
  messageId: string
): Promise<void> {
  try {
    await requireMessageAccess(db, principalId, role, messageId, "agent");
  } catch (error) {
    if (error instanceof AppError && error.code === "MAILBOX_FORBIDDEN") {
      throw new AppError("LABEL_FORBIDDEN", "You cannot label this message.", 403);
    }
    throw error;
  }
}
