import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { reauthenticateUser } from "../../auth/reauthenticate";
import { isRecentSession, requireAuthContext } from "../../auth/session";
import { createDatabase } from "../../db/drizzle";
import { sessions } from "../../db/schema";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { recordAudit } from "../audit/service";

export const sessionControlRoutes = new Hono<HonoApp>();
const reauthenticationSchema = z.object({ password: z.string().min(1).max(128) });

sessionControlRoutes.get("/recent-authentication", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  return c.json({ recent: isRecentSession(auth) });
});

sessionControlRoutes.post("/reauthenticate", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const input = parseWith(reauthenticationSchema, await readJson(c.req.raw));
  try {
    const response = await reauthenticateUser(c.env, c.req.raw, {
      email: auth.user.email,
      password: input.password
    });
    await recordAudit(c.env.DB, {
      correlationId: c.get("correlationId"),
      actorType: "user",
      actorId: auth.user.id,
      action: "session.reauthenticate",
      resourceType: "session",
      resourceId: auth.session.id,
      outcome: "success"
    });
    return response;
  } catch (error) {
    if (error instanceof AppError && error.code === "REAUTHENTICATION_FAILED") {
      await recordAudit(c.env.DB, {
        correlationId: c.get("correlationId"),
        actorType: "user",
        actorId: auth.user.id,
        action: "session.reauthenticate",
        resourceType: "session",
        resourceId: auth.session.id,
        outcome: "denied"
      });
    }
    throw error;
  }
});

sessionControlRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const requestedUser = c.req.query("userId");
  const canManageAll = auth.user.role === "owner" || auth.user.role === "admin";
  const userId = canManageAll && requestedUser ? requestedUser : auth.user.id;
  const web = await createDatabase(c.env.DB)
    .select({ id: sessions.id, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt));
  return c.json({
    userId,
    sessions: [
      ...web.map((row) => ({
        id: row.id,
        kind: "web" as const,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        revokedAt: null
      }))
    ]
  });
});

sessionControlRoutes.delete("/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const id = c.req.param("id");
  const canManageAll = auth.user.role === "owner" || auth.user.role === "admin";
  const result = await createDatabase(c.env.DB)
    .delete(sessions)
    .where(
      canManageAll
        ? eq(sessions.id, id)
        : and(eq(sessions.id, id), eq(sessions.userId, auth.user.id))
    )
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new AppError("SESSION_NOT_FOUND", "Active session not found.", 404);
  }
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "session.revoke",
    resourceType: "session",
    resourceId: id,
    outcome: "success",
    metadata: { kind: "web" }
  });
  return c.body(null, 204);
});
