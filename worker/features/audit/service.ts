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
  "token"
]);

export async function recordAudit(db: D1Database, input: AuditInput): Promise<void> {
  for (const key of Object.keys(input.metadata ?? {})) {
    if (forbiddenMetadata.has(key.toLowerCase())) {
      throw new Error(`Sensitive audit metadata rejected: ${key}`);
    }
  }
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
