import { type Context, Hono } from "hono";
import { requireMailApiPrincipal } from "../../auth/mail-api";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { ignoreMailEventFailure, publishUserMailEvent } from "../events/service";
import { isSafeInlineImage, normalizedContentType } from "../messages/inline-media";
import { resolveDraftSignature } from "../signatures/service";
import { getAccessibleDraft, listAccessibleDraftPage, requireDraftAccess } from "./access";
import { storeDraftAttachment } from "./attachments";
import { defaultDraftChangeLimit, listDraftChanges, maxDraftChangeLimit } from "./change-queries";
import { defaultDraftLimit, maxDraftLimit } from "./list-queries";
import {
  deleteDraft,
  findInlineDraftAttachment,
  removeDraftAttachment,
  saveDraft
} from "./queries";
import { draftSchema } from "./validation";

export const draftRoutes = new Hono<HonoApp>();
draftRoutes.get("/", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  const page = await listAccessibleDraftPage(c.env, draftPrincipal(auth), {
    cursor: c.req.query("cursor"),
    limit: parseDraftLimit(c.req.query("limit"), defaultDraftLimit, maxDraftLimit)
  });
  const response = c.json(page.drafts);
  if (page.nextCursor) {
    response.headers.set("link", `<${nextDraftPageUrl(c.req.url, page.nextCursor)}>; rel="next"`);
  }
  return response;
});
draftRoutes.get("/changes", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  for (const name of ["mailboxId", "folder", "search", "updatedSince"]) {
    if (c.req.query(name) !== undefined) {
      throw new AppError(
        "INVALID_DRAFT_CHANGE_FILTER",
        "The draft changes feed does not accept mailbox, folder, search, or timestamp filters.",
        400
      );
    }
  }
  return c.json(
    await listDraftChanges(c.env, draftPrincipal(auth), {
      cursor: c.req.query("cursor"),
      limit: parseDraftLimit(c.req.query("limit"), defaultDraftChangeLimit, maxDraftChangeLimit)
    })
  );
});
draftRoutes.get("/:id", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  return c.json(await getAccessibleDraft(c.env, draftPrincipal(auth), c.req.param("id")));
});
draftRoutes.post("/", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  const input = parseWith(draftSchema, await readJson(c.req.raw));
  await requireDraftAccess(c.env, draftPrincipal(auth), input);
  const signature = await resolveDraftSignature(c.env.DB, auth.principal, {
    from: input.from,
    selection: input.signature
  });
  const draft = await saveDraft(c.env.DB, auth.principal.id, { ...input, signature });
  scheduleDraftEvent(c, auth.principal.id);
  return c.json(draft, 201);
});
draftRoutes.patch("/:id", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  const current = await getAccessibleDraft(c.env, draftPrincipal(auth), c.req.param("id"));
  const input = parseWith(draftSchema, await readJson(c.req.raw));
  await requireDraftAccess(c.env, draftPrincipal(auth), input);
  const signature = await resolveDraftSignature(c.env.DB, auth.principal, {
    from: input.from,
    selection: input.signature,
    current: { from: current.from, signature: current.signature }
  });
  const draft = await saveDraft(c.env.DB, auth.principal.id, {
    ...input,
    id: c.req.param("id"),
    signature
  });
  scheduleDraftEvent(c, auth.principal.id);
  return c.json(draft);
});
draftRoutes.delete("/:id", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  await getAccessibleDraft(c.env, draftPrincipal(auth), c.req.param("id"));
  if (!(await deleteDraft(c.env.DB, c.env.MAIL_OBJECTS, auth.principal.id, c.req.param("id"))))
    throw new AppError("DRAFT_NOT_FOUND", "Draft not found.", 404);
  scheduleDraftEvent(c, auth.principal.id);
  return c.body(null, 204);
});
draftRoutes.post("/:id/attachments", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  await getAccessibleDraft(c.env, draftPrincipal(auth), c.req.param("id"));
  const body = await c.req.raw.formData();
  const file = body.get("file");
  if (!(file instanceof File)) throw new AppError("FILE_REQUIRED", "Choose a file.", 400);
  const attachment = await storeDraftAttachment(
    c.env,
    auth.principal.id,
    c.req.param("id"),
    file,
    body.get("inline") === "true"
  );
  scheduleDraftEvent(c, auth.principal.id);
  return c.json(attachment, 201);
});
draftRoutes.get("/:draftId/attachments/:id/inline", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  await getAccessibleDraft(c.env, draftPrincipal(auth), c.req.param("draftId"));
  const attachment = await findInlineDraftAttachment(
    c.env.DB,
    auth.principal.id,
    c.req.param("draftId"),
    c.req.param("id")
  );
  if (!attachment) throw new AppError("ATTACHMENT_NOT_FOUND", "Attachment not found.", 404);
  if (!isSafeInlineImage(attachment.content_type)) {
    throw new AppError("INLINE_MEDIA_UNSUPPORTED", "Attachment cannot be displayed inline.", 415);
  }
  const object = await c.env.MAIL_OBJECTS.get(attachment.r2_key);
  if (!object) {
    throw new AppError("ATTACHMENT_OBJECT_NOT_FOUND", "Attachment object not found.", 404);
  }
  return new Response(object.body, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": "inline",
      "content-security-policy": "sandbox; default-src 'none'",
      "content-type": normalizedContentType(attachment.content_type),
      "x-content-type-options": "nosniff"
    }
  });
});
draftRoutes.delete("/:draftId/attachments/:id", async (c) => {
  const auth = await requireMailApiPrincipal(c.env, c.req.raw, "mail:send");
  await getAccessibleDraft(c.env, draftPrincipal(auth), c.req.param("draftId"));
  if (
    !(await removeDraftAttachment(
      c.env.DB,
      c.env.MAIL_OBJECTS,
      auth.principal.id,
      c.req.param("draftId"),
      c.req.param("id")
    ))
  )
    throw new AppError("ATTACHMENT_NOT_FOUND", "Attachment not found.", 404);
  scheduleDraftEvent(c, auth.principal.id);
  return c.body(null, 204);
});

function scheduleDraftEvent(c: Context<HonoApp>, principalId: string): void {
  c.executionCtx.waitUntil(
    ignoreMailEventFailure(publishUserMailEvent(c.env, principalId, "drafts"))
  );
}

function draftPrincipal(auth: Awaited<ReturnType<typeof requireMailApiPrincipal>>) {
  return { id: auth.principal.id, role: auth.principal.role };
}

function parseDraftLimit(
  value: string | undefined,
  defaultLimit: number,
  maximumLimit: number
): number {
  if (value === undefined) return defaultLimit;
  const limit = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isInteger(limit) || limit < 1 || limit > maximumLimit) {
    throw new AppError("INVALID_LIMIT", `Limit must be an integer from 1 to ${maximumLimit}.`, 400);
  }
  return limit;
}

function nextDraftPageUrl(requestUrl: string, cursor: string): string {
  const url = new URL(requestUrl);
  const preserved = new URLSearchParams();
  const limit = url.searchParams.get("limit");
  if (limit !== null) preserved.set("limit", limit);
  preserved.set("cursor", cursor);
  url.search = preserved.toString();
  return url.toString();
}
