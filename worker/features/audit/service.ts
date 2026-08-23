import { newId, nowIso } from "../../db/client";

export type AuditInput = {
  correlationId: string;
  actorType: "user" | "agent" | "system" | "operator";
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
  "token"
]);

export async function recordAudit(db: D1Database, input: AuditInput): Promise<void> {
  await auditStatement(db, input).run();
}

export function auditStatement(
  db: D1Database,
  input: AuditInput,
  occurredAt = nowIso()
): D1PreparedStatement {
  for (const key of Object.keys(input.metadata ?? {})) {
    if (forbiddenMetadata.has(key.toLowerCase())) {
      throw new Error(`Sensitive audit metadata rejected: ${key}`);
    }
  }
  return db
    .prepare(
      `INSERT INTO audit_events
       (id, occurred_at, correlation_id, actor_type, actor_id, action, resource_type,
        resource_id, outcome, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newId("aud"),
      occurredAt,
      input.correlationId,
      input.actorType,
      input.actorId ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.outcome,
      JSON.stringify(input.metadata ?? {})
    );
}
