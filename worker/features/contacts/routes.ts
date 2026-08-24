import { Hono } from "hono";
import { z } from "zod";

import { accessibleMessageScope } from "../../auth/mailbox-access";
import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { emailAddressSchema } from "../../lib/validation";
import { withConversationLabels } from "../labels/queries";

import { deleteSavedContact, getContactDetail, listContacts, saveContact } from "./queries";

export const contactRoutes = new Hono<HonoApp>();

const contactInputSchema = z.object({
  email: emailAddressSchema,
  name: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .transform((value) => value || null),
  notes: z.string().max(10_000)
});

contactRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const search = c.req.query("search")?.trim();
  if (search && search.length > 200) {
    throw new AppError("CONTACT_INVALID", "Contact search is too long.", 400);
  }
  const scope = await accessibleMessageScope(c.env.DB, auth.user.id, auth.user.role, "read");
  return c.json(
    await listContacts(c.env.DB, {
      limit: contactLimit(c.req.query("limit")),
      scope,
      search,
      userId: auth.user.id
    })
  );
});

contactRoutes.get("/:email", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const email = contactEmail(c.req.param("email"));
  const scope = await accessibleMessageScope(c.env.DB, auth.user.id, auth.user.role, "read");
  const detail = await getContactDetail(c.env.DB, { email, scope, userId: auth.user.id });
  return c.json({
    ...detail,
    conversations: await withConversationLabels(c.env.DB, detail.conversations, scope)
  });
});

contactRoutes.put("/:email", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const previousEmail = contactEmail(c.req.param("email"));
  const input = contactInput(await readJson(c.req.raw));
  await saveContact(c.env.DB, { ...input, previousEmail, userId: auth.user.id });
  const scope = await accessibleMessageScope(c.env.DB, auth.user.id, auth.user.role, "read");
  const detail = await getContactDetail(c.env.DB, {
    email: input.email,
    scope,
    userId: auth.user.id
  });
  return c.json({
    ...detail,
    conversations: await withConversationLabels(c.env.DB, detail.conversations, scope)
  });
});

contactRoutes.delete("/:email", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  await deleteSavedContact(c.env.DB, auth.user.id, contactEmail(c.req.param("email")));
  return c.body(null, 204);
});

function contactEmail(value: unknown): string {
  const result = emailAddressSchema.safeParse(value);
  if (!result.success) throw new AppError("CONTACT_INVALID", "Contact email is invalid.", 400);
  return result.data;
}

function contactInput(value: unknown): z.infer<typeof contactInputSchema> {
  const result = contactInputSchema.safeParse(value);
  if (!result.success) {
    throw new AppError(
      "CONTACT_INVALID",
      result.error.issues[0]?.message ?? "Contact is invalid.",
      400
    );
  }
  return result.data;
}

function contactLimit(value: string | undefined): number {
  if (value === undefined) return 100;
  const limit = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError("CONTACT_INVALID", "Contact limit must be an integer from 1 to 100.", 400);
  }
  return limit;
}
