import { Hono } from "hono";
import { z } from "zod";

import { requireMailApiPrincipal } from "../../auth/mail-api";
import { type AuthContext, requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { recordAudit } from "../audit/service";

import { createLabel, deleteLabel, labelColors, listLabels, updateLabel } from "./queries";

export const labelRoutes = new Hono<HonoApp>();
export const mailLabelRoutes = new Hono<HonoApp>();

const createLabelSchema = z.object({
  color: z.enum(labelColors),
  name: z.string().trim().min(1).max(80)
});
const updateLabelSchema = createLabelSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Supply a label name or color."
  });

labelRoutes.get("/", async (c) => {
  await requireAuthContext(c.env, c.req.raw);
  return c.json(await listLabels(c.env.DB));
});

mailLabelRoutes.get("/", async (c) => {
  await requireMailApiPrincipal(c.env, c.req.raw, "mail:read");
  return c.json(await listLabels(c.env.DB));
});

labelRoutes.post("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireLabelManager(auth);
  const input = labelInput(createLabelSchema, await readJson(c.req.raw));
  const label = await createLabel(c.env.DB, { ...input, userId: auth.user.id });
  await recordLabelAudit(c.env.DB, c.get("correlationId"), auth.user.id, "label.create", label.id);
  return c.json(label, 201);
});

labelRoutes.patch("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireLabelManager(auth);
  const input = labelInput(updateLabelSchema, await readJson(c.req.raw));
  const label = await updateLabel(c.env.DB, c.req.param("id"), input);
  await recordLabelAudit(c.env.DB, c.get("correlationId"), auth.user.id, "label.update", label.id);
  return c.json(label);
});

labelRoutes.delete("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireLabelManager(auth);
  await deleteLabel(c.env.DB, c.req.param("id"));
  await recordLabelAudit(
    c.env.DB,
    c.get("correlationId"),
    auth.user.id,
    "label.delete",
    c.req.param("id")
  );
  return c.body(null, 204);
});

function requireLabelManager(auth: AuthContext): void {
  if (auth.user.role !== "owner" && auth.user.role !== "admin") {
    throw new AppError("LABEL_FORBIDDEN", "Only an owner or admin can manage labels.", 403);
  }
}

function labelInput<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      "LABEL_INVALID",
      result.error.issues[0]?.message ?? "Label is invalid.",
      400
    );
  }
  return result.data;
}

function recordLabelAudit(
  db: D1Database,
  correlationId: string,
  userId: string,
  action: string,
  labelId: string
): Promise<void> {
  return recordAudit(db, {
    action,
    actorId: userId,
    actorType: "user",
    correlationId,
    outcome: "success",
    resourceId: labelId,
    resourceType: "label"
  });
}
