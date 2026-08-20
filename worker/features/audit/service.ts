import { newId, nowIso } from "../../db/client";
import { createDatabase } from "../../db/drizzle";
import { auditEvents } from "../../db/schema";

export type AuditInput = {
  correlationId: string;
  actorType: "user" | "system" | "operator";
  actorId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: "success" | "denied" | "failure";
  metadata?: Record<string, string | number | boolean | null>;
};

const forbiddenMetadata = new Set([
  "address",
  "body",
  "content",
  "credential",
  "email",
  "filename",
  "password",
  "raw",
  "recipient",
  "secret",
  "subject",
  "token",
  "tokenhash",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "authorizationheader",
  "requestbody",
  "responsebody"
]);

export type AuditInsertGuard =
  | { kind: "personal-access-token-exists"; id: string }
  | { kind: "active-personal-access-token"; id: string; userId?: string };

export function prepareAuditInsert(
  db: D1Database,
  input: AuditInput,
  guard?: AuditInsertGuard
): D1PreparedStatement {
  assertSafeAuditMetadata(input);

  const guardValues: string[] = [];
  let guardSql = "";
  if (guard?.kind === "personal-access-token-exists") {
    guardSql = " WHERE EXISTS (SELECT 1 FROM personal_access_tokens WHERE id = ?)";
    guardValues.push(guard.id);
  } else if (guard?.kind === "active-personal-access-token") {
    guardSql =
      " WHERE EXISTS (SELECT 1 FROM personal_access_tokens WHERE id = ? AND revoked_at IS NULL";
    guardValues.push(guard.id);
    if (guard.userId !== undefined) {
      guardSql += " AND user_id = ?";
      guardValues.push(guard.userId);
    }
    guardSql += ")";
  }

  return db
    .prepare(
      `INSERT INTO audit_events
       (id, occurred_at, correlation_id, actor_type, actor_id, action, resource_type,
        resource_id, outcome, metadata_json)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${guardSql}`
    )
    .bind(
      newId("aud"),
      nowIso(),
      input.correlationId,
      input.actorType,
      input.actorId ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.outcome,
      JSON.stringify(input.metadata ?? {}),
      ...guardValues
    );
}

export async function recordAudit(db: D1Database, input: AuditInput): Promise<void> {
  assertSafeAuditMetadata(input);
  const database = createDatabase(db);
  await database
    .insert(auditEvents)
    .values({
      id: newId("aud"),
      occurredAt: nowIso(),
      correlationId: input.correlationId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      outcome: input.outcome,
      metadata: input.metadata ?? {}
    })
    .run();
}

function assertSafeAuditMetadata(input: AuditInput): void {
  for (const key of Object.keys(input.metadata ?? {})) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
    if (forbiddenMetadata.has(normalizedKey)) {
      throw new Error(`Sensitive audit metadata rejected: ${key}`);
    }
  }
}
