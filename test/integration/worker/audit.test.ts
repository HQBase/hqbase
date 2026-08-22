import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { recordAudit } from "../../../worker/features/audit/service";
import { applyCurrentMigrations } from "./current-migrations";

describe("audit event writes", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM audit_events").run();
  });

  it("stores one audit event and its JSON metadata through Drizzle", async () => {
    await recordAudit(env.DB, {
      correlationId: "request_audit",
      actorType: "operator",
      actorId: "operator_1",
      action: "workspace.inspect",
      resourceType: "workspace",
      resourceId: "workspace_1",
      outcome: "success",
      metadata: { attempt: 2, enabled: true, reason: null }
    });

    const row = await env.DB.prepare(
      `SELECT id, occurred_at, correlation_id, actor_type, actor_id, action,
              resource_type, resource_id, outcome, metadata_json
       FROM audit_events`
    ).first<{
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

    expect(row).toMatchObject({
      correlation_id: "request_audit",
      actor_type: "operator",
      actor_id: "operator_1",
      action: "workspace.inspect",
      resource_type: "workspace",
      resource_id: "workspace_1",
      outcome: "success"
    });
    expect(row?.id).toMatch(/^aud_/);
    expect(row?.occurred_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.parse(row?.metadata_json ?? "null")).toEqual({
      attempt: 2,
      enabled: true,
      reason: null
    });
  });

  it("rejects sensitive metadata without writing an event", async () => {
    await expect(
      recordAudit(env.DB, {
        correlationId: "request_sensitive",
        actorType: "system",
        action: "workspace.inspect",
        resourceType: "workspace",
        outcome: "denied",
        metadata: { token: "must-not-be-stored" }
      })
    ).rejects.toThrow("Sensitive audit metadata");

    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM audit_events").first<{
      count: number;
    }>();
    expect(row?.count).toBe(0);
  });
});
