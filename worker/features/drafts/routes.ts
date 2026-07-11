import { Hono } from "hono";
import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import {
  addDraftAttachment,
  deleteDraft,
  getDraft,
  listDrafts,
  removeDraftAttachment,
  saveDraft
} from "./queries";
import { draftSchema } from "./validation";

export const draftRoutes = new Hono<HonoApp>();
draftRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  return c.json(await listDrafts(c.env.DB, auth.user.id));
});
draftRoutes.get("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const draft = await getDraft(c.env.DB, auth.user.id, c.req.param("id"));
  if (!draft) throw new AppError("DRAFT_NOT_FOUND", "Draft not found.", 404);
  return c.json(draft);
});
draftRoutes.post("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  return c.json(
    await saveDraft(c.env.DB, auth.user.id, parseWith(draftSchema, await readJson(c.req.raw))),
    201
  );
});
draftRoutes.patch("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const input = parseWith(draftSchema, await readJson(c.req.raw));
  return c.json(await saveDraft(c.env.DB, auth.user.id, { ...input, id: c.req.param("id") }));
});
draftRoutes.delete("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  if (!(await deleteDraft(c.env.DB, c.env.MAIL_OBJECTS, auth.user.id, c.req.param("id"))))
    throw new AppError("DRAFT_NOT_FOUND", "Draft not found.", 404);
  return c.body(null, 204);
});
draftRoutes.post("/:id/attachments", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const body = await c.req.raw.formData();
  const file = body.get("file");
  if (!(file instanceof File)) throw new AppError("FILE_REQUIRED", "Choose a file.", 400);
  const added = await addDraftAttachment(c.env.DB, auth.user.id, c.req.param("id"), file);
  await c.env.MAIL_OBJECTS.put(added.r2Key, file.stream(), {
    httpMetadata: { contentType: added.attachment.contentType }
  });
  return c.json(added.attachment, 201);
});
draftRoutes.delete("/:draftId/attachments/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  if (
    !(await removeDraftAttachment(
      c.env.DB,
      c.env.MAIL_OBJECTS,
      auth.user.id,
      c.req.param("draftId"),
      c.req.param("id")
    ))
  )
    throw new AppError("ATTACHMENT_NOT_FOUND", "Attachment not found.", 404);
  return c.body(null, 204);
});
