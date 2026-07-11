import { Hono } from "hono";
import { z } from "zod";

import { mailboxAccessLevels } from "../../auth/mailbox-access";
import { requireAuthContext, requireRole } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { recordAudit } from "../audit/service";
import {
  listMailboxGrants,
  revokeMailboxGrant,
  revokeUserMailSessions,
  setMailboxGrant
} from "./queries";

const grantSchema = z.object({
  mailboxId: z.string().min(1).max(100),
  userId: z.string().min(1).max(100),
  accessLevel: z.enum(mailboxAccessLevels)
});

export const mailboxAccessRoutes = new Hono<HonoApp>();

mailboxAccessRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  return c.json(await listMailboxGrants(c.env.DB));
});

mailboxAccessRoutes.put("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  const input = parseWith(grantSchema, await readJson(c.req.raw));
  const target = await c.env.DB.prepare('SELECT role FROM "user" WHERE id = ?')
    .bind(input.userId)
    .first<{ role: string | null }>();
  if (!target) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  if (target.role === "owner") {
    throw new AppError("OWNER_GRANT_IMPLICIT", "Owners already have implicit manager access.", 400);
  }
  await setMailboxGrant(c.env.DB, input.mailboxId, input.userId, input.accessLevel, auth.user.id);
  await revokeUserMailSessions(c.env.DB, input.userId);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "mailbox.grant.set",
    resourceType: "mailbox_grant",
    resourceId: `${input.mailboxId}:${input.userId}`,
    outcome: "success",
    metadata: { accessLevel: input.accessLevel }
  });
  return c.body(null, 204);
});

mailboxAccessRoutes.delete("/:mailboxId/:userId", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  await revokeMailboxGrant(c.env.DB, c.req.param("mailboxId"), c.req.param("userId"));
  await revokeUserMailSessions(c.env.DB, c.req.param("userId"));
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "mailbox.grant.revoke",
    resourceType: "mailbox_grant",
    resourceId: `${c.req.param("mailboxId")}:${c.req.param("userId")}`,
    outcome: "success"
  });
  return c.body(null, 204);
});
