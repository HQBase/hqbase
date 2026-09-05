import { sql } from "drizzle-orm";
import { Hono } from "hono";

import { requireAuthContext, requireRecentSession, requireRole } from "../../auth/session";
import { getRow } from "../../db/drizzle";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { recordAudit } from "../audit/service";
import { ignoreMailEventFailure, publishUserMailEvent } from "../events/service";

import { listUsers, setWorkspaceUserRole } from "./queries";
import {
  createWorkspaceUser,
  regenerateTemporaryPassword,
  resendWorkspaceInvitation
} from "./service";
import { createUserSchema, updateUserSchema } from "./validation";

export const userRoutes = new Hono<HonoApp>();

userRoutes.get("/", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);
  return c.json(await listUsers(c.env.DB));
});

userRoutes.post("/", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);

  const input = parseWith(createUserSchema, await readJson(c.req.raw));
  if (input.role === "owner" && authContext.user.role !== "owner") {
    throw new AppError("OWNER_REQUIRED", "Only an owner can create another owner.", 403);
  }
  const result = await createWorkspaceUser(c.env, c.req.raw, authContext.user.id, input);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: input.method === "email_invite" ? "user.invite" : "user.create",
    resourceType: "user",
    resourceId: result.user.id,
    outcome: "success",
    metadata: { method: input.method, role: input.role }
  });
  return c.json(result, 201);
});

userRoutes.post("/:id/resend-invitation", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);
  const target = await getUserRole(c.env.DB, c.req.param("id"));
  if (!target) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  if (target.banned) throw new AppError("USER_REMOVED", "Restore this user first.", 409);
  if (target.role === "owner" && authContext.user.role !== "owner") {
    throw new AppError("OWNER_REQUIRED", "Only an owner can manage another owner.", 403);
  }

  const user = await resendWorkspaceInvitation(c.env, c.req.raw, c.req.param("id"));
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "user.invite.resend",
    resourceType: "user",
    resourceId: user.id,
    outcome: "success",
    metadata: {}
  });
  return c.json(user);
});

userRoutes.post("/:id/temporary-password", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);
  const target = await getUserRole(c.env.DB, c.req.param("id"));
  if (!target) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  if (target.banned) throw new AppError("USER_REMOVED", "Restore this user first.", 409);
  if (target.role === "owner" && authContext.user.role !== "owner") {
    throw new AppError("OWNER_REQUIRED", "Only an owner can manage another owner.", 403);
  }

  const result = await regenerateTemporaryPassword(c.env, c.req.raw, c.req.param("id"));
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "user.temporary-password.regenerate",
    resourceType: "user",
    resourceId: result.user.id,
    outcome: "success",
    metadata: {}
  });
  return c.json(result);
});

userRoutes.patch("/:id", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);

  const input = parseWith(updateUserSchema, await readJson(c.req.raw));
  const target = await getUserRole(c.env.DB, c.req.param("id"));
  if (!target) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  if (target.banned) throw new AppError("USER_REMOVED", "Restore this user first.", 409);
  if ((input.role === "owner" || target.role === "owner") && authContext.user.role !== "owner") {
    throw new AppError("OWNER_REQUIRED", "Only an owner can change owner membership.", 403);
  }
  await setWorkspaceUserRole(c.env.DB, c.req.param("id"), input.role, authContext.user.id);
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "user.role.update",
    resourceType: "user",
    resourceId: c.req.param("id"),
    outcome: "success",
    metadata: { role: input.role }
  });
  c.executionCtx.waitUntil(
    ignoreMailEventFailure(publishUserMailEvent(c.env, c.req.param("id"), "mailboxes"))
  );
  return c.json({ ok: true });
});

userRoutes.delete("/:id", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);
  requireRecentSession(authContext, undefined, "Sign in again before removing a user.");

  const userId = c.req.param("id");
  const target = await getUserRole(c.env.DB, userId);
  if (!target) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  if (userId === authContext.user.id) {
    throw new AppError("SELF_REMOVAL", "You cannot remove your own account.", 409);
  }
  requireOwnerForOwnerTarget(authContext.user.role, target.role);
  if (target.banned) throw new AppError("USER_REMOVED", "This user is already removed.", 409);

  const timestamp = new Date().toISOString();
  const activeRemoval = `EXISTS (
    SELECT 1 FROM "user"
    WHERE id = ? AND COALESCE(banned, 0) = 1 AND updatedAt = ?
  )`;
  const [result] = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE "user"
         SET banned = 1, banReason = 'Removed from workspace', banExpires = NULL, updatedAt = ?
         WHERE id = ?
           AND id <> ?
           AND COALESCE(banned, 0) = 0
           AND (? = 'owner' OR COALESCE(role, 'member') <> 'owner')
           AND (
             COALESCE(role, 'member') <> 'owner'
             OR (SELECT COUNT(*) FROM "user"
                 WHERE role = 'owner' AND COALESCE(banned, 0) = 0) > 1
           )`
    ).bind(timestamp, userId, authContext.user.id, authContext.user.role),
    guardedDelete(c.env.DB, "mailbox_grants", "principal_id", userId, timestamp, activeRemoval),
    guardedDelete(c.env.DB, "oauthAccessToken", "userId", userId, timestamp, activeRemoval),
    guardedDelete(c.env.DB, "oauthRefreshToken", "userId", userId, timestamp, activeRemoval),
    guardedDelete(c.env.DB, "oauthConsent", "userId", userId, timestamp, activeRemoval),
    guardedDelete(c.env.DB, "deviceCode", "userId", userId, timestamp, activeRemoval),
    c.env.DB.prepare(
      `DELETE FROM verification
         WHERE value = ? AND identifier LIKE 'reset-password:%' AND ${activeRemoval}`
    ).bind(userId, userId, timestamp),
    guardedDelete(c.env.DB, "push_subscriptions", "user_id", userId, timestamp, activeRemoval),
    guardedDelete(c.env.DB, "session", "userId", userId, timestamp, activeRemoval)
  ]);

  if ((result?.meta.changes ?? 0) === 0) {
    const current = await getUserRole(c.env.DB, userId);
    if (!current) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
    requireOwnerForOwnerTarget(authContext.user.role, current.role);
    if (current.banned) throw new AppError("USER_REMOVED", "This user is already removed.", 409);
    throw new AppError("LAST_OWNER", "The last active owner cannot be removed.", 409);
  }

  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "user.remove",
    resourceType: "user",
    resourceId: userId,
    outcome: "success",
    metadata: { role: target.role ?? "member" }
  });
  return c.body(null, 204);
});

userRoutes.post("/:id/restore", async (c) => {
  const authContext = await requireAuthContext(c.env, c.req.raw);
  requireRole(authContext, ["owner", "admin"]);
  requireRecentSession(authContext, undefined, "Sign in again before restoring a user.");

  const userId = c.req.param("id");
  const target = await getUserRole(c.env.DB, userId);
  if (!target) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
  requireOwnerForOwnerTarget(authContext.user.role, target.role);
  if (!target.banned) throw new AppError("USER_ACTIVE", "This user is already active.", 409);

  const result = await c.env.DB.prepare(
    `UPDATE "user"
       SET banned = 0, banReason = NULL, banExpires = NULL, updatedAt = ?
       WHERE id = ?
         AND COALESCE(banned, 0) = 1
         AND (? = 'owner' OR COALESCE(role, 'member') <> 'owner')`
  )
    .bind(new Date().toISOString(), userId, authContext.user.role)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    const current = await getUserRole(c.env.DB, userId);
    if (!current) throw new AppError("USER_NOT_FOUND", "User not found.", 404);
    requireOwnerForOwnerTarget(authContext.user.role, current.role);
    throw new AppError("USER_ACTIVE", "This user is already active.", 409);
  }

  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: authContext.user.id,
    action: "user.restore",
    resourceType: "user",
    resourceId: userId,
    outcome: "success",
    metadata: { role: target.role ?? "member" }
  });
  return c.json({ ok: true });
});

function getUserRole(
  db: D1Database,
  userId: string
): Promise<{ banned: number | null; role: string | null } | null> {
  return getRow(db, sql`SELECT banned, role FROM "user" WHERE id = ${userId}`);
}

function requireOwnerForOwnerTarget(actorRole: string, targetRole: string | null): void {
  if (targetRole === "owner" && actorRole !== "owner") {
    throw new AppError("OWNER_REQUIRED", "Only an owner can manage another owner.", 403);
  }
}

function guardedDelete(
  db: D1Database,
  table: string,
  userColumn: string,
  userId: string,
  timestamp: string,
  activeRemoval: string
): D1PreparedStatement {
  return db
    .prepare(`DELETE FROM "${table}" WHERE "${userColumn}" = ? AND ${activeRemoval}`)
    .bind(userId, userId, timestamp);
}
