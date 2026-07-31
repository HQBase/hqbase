import { Hono } from "hono";
import { z } from "zod";

import { completePasswordSetup, isPasswordSetupRequired } from "../auth/password-setup";
import { requireAuthContext } from "../auth/session";
import { changeCurrentUserPassword } from "../auth/user-actions";
import { recordAudit } from "../features/audit/service";
import { getDefaultFromMailboxId } from "../features/preferences/queries";
import { updateDefaultFromMailbox } from "../features/preferences/service";
import { completePasswordSetupSchema } from "../features/users/validation";
import type { HonoApp } from "../lib/env";
import { AppError } from "../lib/errors";
import { readJson } from "../lib/json";
import { parseWith } from "../lib/validation";

export const meRoutes = new Hono<HonoApp>();
const updateMeSchema = z.object({
  defaultFromMailboxId: z.string().min(1).max(100)
});

meRoutes.get("/", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw, {
    allowPasswordSetupRequired: true
  });
  return c.json({
    ...authContext.user,
    defaultFromMailboxId: await getDefaultFromMailboxId(c.env.DB, authContext.user.id),
    passwordSetupRequired: await isPasswordSetupRequired(c.env.DB, authContext.user.id)
  });
});

meRoutes.post("/password", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw, {
    allowPasswordSetupRequired: true
  });
  if (!(await isPasswordSetupRequired(c.env.DB, authContext.user.id))) {
    throw new AppError(
      "PASSWORD_SETUP_NOT_REQUIRED",
      "This account has already completed password setup.",
      409
    );
  }
  const input = parseWith(completePasswordSetupSchema, await readJson(c.req.raw));
  const sessionCookie = await changeCurrentUserPassword(c.env, c.req.raw, input);
  await completePasswordSetup(c.env.DB, authContext.user.id);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "user.password.setup",
    resourceType: "user",
    resourceId: authContext.user.id,
    outcome: "success",
    metadata: {}
  });
  if (sessionCookie) c.header("set-cookie", sessionCookie);
  return c.json({ ok: true });
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
