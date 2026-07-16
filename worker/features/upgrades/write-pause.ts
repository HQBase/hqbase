import type { MiddlewareHandler } from "hono";
import type { HonoApp } from "../../lib/env";
import { AppError } from "../../lib/errors";

const pausedStates = ["migration_started", "migration_complete", "candidate_verified", "promoted"];

export const enforceUpgradeWritePause: MiddlewareHandler<HonoApp> = async (c, next) => {
  if (
    ["GET", "HEAD", "OPTIONS"].includes(c.req.method) ||
    new URL(c.req.url).pathname.startsWith("/api/upgrades/pro/")
  ) {
    await next();
    return;
  }
  const row = await c.env.DB.prepare(
    `SELECT state FROM community_pro_upgrades
       WHERE state IN (${pausedStates.map(() => "?").join(", ")}) LIMIT 1`
  )
    .bind(...pausedStates)
    .first<{ state: string }>()
    .catch(() => null);
  if (row) {
    throw new AppError(
      "UPGRADE_WRITE_PAUSED",
      "Workspace changes are briefly paused while HQBase Pro is promoted.",
      423
    );
  }
  await next();
};
