import { Hono } from "hono";
import { z } from "zod";

import { requireAuthContext } from "../../auth/session";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { recordAudit } from "../audit/service";

export const sessionControlRoutes = new Hono<HonoApp>();

sessionControlRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const requestedUser = c.req.query("userId");
  const canManageAll = auth.user.role === "owner" || auth.user.role === "admin";
  const userId = canManageAll && requestedUser ? requestedUser : auth.user.id;
  const [web, bridge] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, createdAt AS created_at, expiresAt AS expires_at
       FROM "session" WHERE userId = ? ORDER BY createdAt DESC`
    )
      .bind(userId)
      .all<{ id: string; created_at: string; expires_at: string }>(),
    c.env.DB.prepare(
      `SELECT id, created_at, expires_at, revoked_at
       FROM pro_mail_sessions WHERE user_id = ? ORDER BY created_at DESC`
    )
      .bind(userId)
      .all<{ id: string; created_at: string; expires_at: string; revoked_at: string | null }>()
  ]);
  return c.json({
    userId,
    sessions: [
      ...web.results.map((row) => ({
        id: row.id,
        kind: "web" as const,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: null
      })),
      ...bridge.results.map((row) => ({
        id: row.id,
        kind: "bridge" as const,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at
      }))
    ]
  });
});

sessionControlRoutes.delete("/:kind/:id", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const kind = z.enum(["web", "bridge"]).parse(c.req.param("kind"));
  const id = c.req.param("id");
  const canManageAll = auth.user.role === "owner" || auth.user.role === "admin";
  const result =
    kind === "web"
      ? await c.env.DB.prepare(`DELETE FROM "session" WHERE id = ? AND (? = 1 OR userId = ?)`)
          .bind(id, canManageAll ? 1 : 0, auth.user.id)
          .run()
      : await c.env.DB.prepare(
          `UPDATE pro_mail_sessions SET revoked_at = datetime('now')
           WHERE id = ? AND revoked_at IS NULL AND (? = 1 OR user_id = ?)`
        )
          .bind(id, canManageAll ? 1 : 0, auth.user.id)
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
    metadata: { kind }
  });
  return c.body(null, 204);
});
