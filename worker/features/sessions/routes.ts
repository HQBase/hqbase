import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { reauthenticateUser } from "../../auth/reauthenticate";
import { isRecentSession, requireAuthContext } from "../../auth/session";
import { createDatabase, getRow } from "../../db/drizzle";
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
  await rejectAdminOwnerSessionTarget(c.env.DB, auth.user.role, userId);
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
  const result = await createDatabase(c.env.DB)
    .delete(sessions)
    .where(
      auth.user.role === "owner"
        ? eq(sessions.id, id)
        : auth.user.role === "admin"
          ? and(
              eq(sessions.id, id),
              sql`${sessions.userId} NOT IN (SELECT id FROM "user" WHERE role = 'owner')`
            )
          : and(eq(sessions.id, id), eq(sessions.userId, auth.user.id))
    )
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    if (auth.user.role === "admin") {
      const target = await getRow<{ user_id: string }>(
        c.env.DB,
        sql`SELECT userId AS user_id FROM "session" WHERE id = ${id}`
      );
      if (target) {
        await rejectAdminOwnerSessionTarget(c.env.DB, auth.user.role, target.user_id);
      }
    }
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

async function rejectAdminOwnerSessionTarget(
  db: D1Database,
  actorRole: string | null,
  userId: string
): Promise<void> {
  if (actorRole !== "admin") return;
  const target = await getRow<{ role: string | null }>(
    db,
    sql`SELECT role FROM "user" WHERE id = ${userId}`
  );
  if (target?.role === "owner") {
    throw new AppError("OWNER_REQUIRED", "Only an owner can manage owner sessions.", 403);
  }
}
