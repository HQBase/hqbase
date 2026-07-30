import { Hono } from "hono";
import { z } from "zod";

import { requireAuthContext } from "../auth/session";
import { getDefaultFromMailboxId } from "../features/preferences/queries";
import { updateDefaultFromMailbox } from "../features/preferences/service";
import type { HonoApp } from "../lib/env";
import { readJson } from "../lib/json";
import { parseWith } from "../lib/validation";

export const meRoutes = new Hono<HonoApp>();
const updateMeSchema = z.object({
  defaultFromMailboxId: z.string().min(1).max(100)
});

meRoutes.get("/", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  return c.json({
    ...authContext.user,
    defaultFromMailboxId: await getDefaultFromMailboxId(c.env.DB, authContext.user.id)
  });
});

meRoutes.patch("/", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  const input = parseWith(updateMeSchema, await readJson(c.req.raw));
  await updateDefaultFromMailbox(c.env.DB, {
    userId: authContext.user.id,
    role: authContext.user.role,
    mailboxId: input.defaultFromMailboxId
  });
  return c.json({
    ...authContext.user,
    defaultFromMailboxId: input.defaultFromMailboxId
  });
});
