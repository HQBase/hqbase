import { Hono } from "hono";
import { z } from "zod";

import { requireAuthContext, requireRole } from "../../auth/session";
import type { HonoApp } from "../../lib/env";

const querySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const auditRoutes = new Hono<HonoApp>();

auditRoutes.get("/", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  const input = querySchema.parse(c.req.query());
  const result = await c.env.DB.prepare(
    `SELECT id, occurred_at, correlation_id, actor_type, actor_id, action, resource_type,
            resource_id, outcome, metadata_json
     FROM audit_events WHERE occurred_at < ? ORDER BY occurred_at DESC LIMIT ?`
  )
    .bind(input.before ?? "9999-12-31T23:59:59.999Z", input.limit)
    .all<{
      id: string;
      occurred_at: string;
      correlation_id: string;
      actor_type: string;
      actor_id: string | null;
      action: string;
      resource_type: string;
      resource_id: string | null;
      outcome: string;
      metadata_json: string;
    }>();
  return c.json(
    result.results.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      correlationId: row.correlation_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      outcome: row.outcome,
      metadata: JSON.parse(row.metadata_json) as Record<string, unknown>
    }))
  );
});
