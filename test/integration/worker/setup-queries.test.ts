import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { upsertWorkspaceHost } from "../../../worker/features/setup/queries";
import { applyCurrentMigrations } from "./current-migrations";

describe("workspace host queries", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM workspace_hosts").run();
  });

  it("demotes the previous canonical portal and upserts the replacement", async () => {
    const timestamp = "2026-08-19T12:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO workspace_hosts
       (id, hostname, kind, is_canonical, status, created_at, updated_at)
       VALUES ('host_old', 'old.example.com', 'portal', 1, 'ready', ?, ?)`
    )
      .bind(timestamp, timestamp)
      .run();

    await upsertWorkspaceHost(env.DB, {
      hostname: "new.example.com",
      kind: "portal"
    });

    const rows = await env.DB.prepare(
      "SELECT hostname, is_canonical FROM workspace_hosts ORDER BY hostname"
    ).all<{ hostname: string; is_canonical: number }>();
    expect(rows.results).toEqual([
      { hostname: "new.example.com", is_canonical: 1 },
      { hostname: "old.example.com", is_canonical: 0 }
    ]);
  });
});
