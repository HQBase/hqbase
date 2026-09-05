import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { requireMailboxAccess } from "../../auth/mailbox-access";
import { requireAuthContext, requireRole } from "../../auth/session";
import { nowIso } from "../../db/client";
import { createDatabase, getRow, getRows } from "../../db/drizzle";
import { retentionPolicies } from "../../db/schema";
import { defaultTrashDays } from "../../jobs/maintenance";
import type { HonoApp } from "../../lib/env";
import { readJson } from "../../lib/json";
import { parseWith } from "../../lib/validation";
import { recordAudit } from "../audit/service";

const retentionSchema = z.object({
  messageDays: z.number().int().min(1).max(3650).nullable(),
  trashDays: z.number().int().min(1).max(3650)
});

export const operationRoutes = new Hono<HonoApp>();

operationRoutes.get("/diagnostics", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  const [schema, counts, operations] = await Promise.all([
    getRows<{ key: string; value: string; updated_at: string }>(
      c.env.DB,
      sql`SELECT key, value, updated_at FROM hqbase_schema_state ORDER BY key`
    ),
    getRow<{
      users: number;
      active_mailboxes: number;
      failed_operations: number;
    }>(
      c.env.DB,
      sql`SELECT
       (SELECT COUNT(*) FROM "user" WHERE COALESCE(banned, 0) = 0) AS users,
       (SELECT COUNT(*) FROM mailboxes WHERE is_active = 1 AND deleted_at IS NULL)
         AS active_mailboxes,
       (SELECT COUNT(*) FROM operation_runs WHERE status = 'failed') AS failed_operations`
    ),
    getRows<{
      id: string;
      kind: string;
      status: string;
      counters_json: string;
      error_code: string | null;
      started_at: string;
      finished_at: string | null;
    }>(
      c.env.DB,
      sql`SELECT id, kind, status, counters_json, error_code, started_at, finished_at
          FROM operation_runs ORDER BY started_at DESC LIMIT 20`
    )
  ]);
  return c.json({
    ready: schema.some((row) => row.key === "product" && row.value === "hqbase"),
    schema,
    counts: {
      users: counts?.users ?? 0,
      activeMailboxes: counts?.active_mailboxes ?? 0,
      failedOperations: counts?.failed_operations ?? 0
    },
    operations: operations.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      counters: JSON.parse(row.counters_json) as Record<string, number>,
      errorCode: row.error_code,
      startedAt: row.started_at,
      finishedAt: row.finished_at
    }))
  });
});

operationRoutes.post("/integrity-scan", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  requireRole(auth, ["owner", "admin"]);
  if (!c.env.HQBASE_JOBS) throw new Error("HQBASE_JOBS binding is required.");
  const id = `integrity:${crypto.randomUUID()}`;
  await c.env.HQBASE_JOBS.send({ id, kind: "integrity-scan", requestedAt: nowIso() });
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "integrity_scan.request",
    resourceType: "operation",
    resourceId: id,
    outcome: "success"
  });
  return c.json({ id }, 202);
});

operationRoutes.get("/retention/:mailboxId", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  await requireMailboxAccess(
    c.env.DB,
    auth.user.id,
    auth.user.role,
    c.req.param("mailboxId"),
    "manager"
  );
  const policy = await getRow(
    c.env.DB,
    sql`SELECT mailbox_id, message_days, trash_days, updated_at
        FROM retention_policies WHERE mailbox_id = ${c.req.param("mailboxId")}`
  );
  return c.json(
    policy ?? {
      mailbox_id: c.req.param("mailboxId"),
      message_days: null,
      trash_days: defaultTrashDays
    }
  );
});

operationRoutes.put("/retention/:mailboxId", async (c) => {
  const auth = await requireAuthContext(c.env, c.req.raw);
  const mailboxId = c.req.param("mailboxId");
  await requireMailboxAccess(c.env.DB, auth.user.id, auth.user.role, mailboxId, "manager");
  const input = parseWith(retentionSchema, await readJson(c.req.raw));
  const updatedAt = nowIso();
  await createDatabase(c.env.DB)
    .insert(retentionPolicies)
    .values({
      mailboxId,
      messageDays: input.messageDays,
      trashDays: input.trashDays,
      updatedBy: auth.user.id,
      updatedAt
    })
    .onConflictDoUpdate({
      target: retentionPolicies.mailboxId,
      set: {
        messageDays: input.messageDays,
        trashDays: input.trashDays,
        updatedBy: auth.user.id,
        updatedAt
      }
    })
    .run();
  await recordAudit(c.env.DB, {
    correlationId: c.get("correlationId"),
    actorType: "user",
    actorId: auth.user.id,
    action: "retention.update",
    resourceType: "mailbox",
    resourceId: mailboxId,
    outcome: "success",
    metadata: { messageDays: input.messageDays, trashDays: input.trashDays }
  });
  return c.body(null, 204);
});
