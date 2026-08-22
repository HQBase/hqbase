import { readFileSync } from "node:fs";
import { verifyPassword } from "better-auth/crypto";
import { describe, expect, it } from "vitest";

import { buildSeedSql, hashSeedPassword } from "../../../scripts/seed-local.mjs";

describe("local database seed", () => {
  it("uses Better Auth's current credential hashing", async () => {
    const hash = await hashSeedPassword("local-seed-password");
    await expect(verifyPassword({ hash, password: "local-seed-password" })).resolves.toBe(true);
    await expect(verifyPassword({ hash, password: "not-the-password" })).resolves.toBe(false);
  });

  it("builds a repeatable complete workspace fixture", async () => {
    const sql = buildSeedSql(
      await hashSeedPassword("local-seed-password"),
      new Date("2026-08-14T18:00:00.000Z")
    );

    expect(sql).toContain("'local_seed_version', '\"local-demo-v3\"'");
    expect(sql).toContain("'setup_complete', 'true'");
    expect(sql).toContain("'owner@hqbase.test'");
    expect(sql).toContain("'admin@hqbase.test'");
    expect(sql).toContain("'support@example.test'");
    expect(sql).toContain("'ops@ops.example.test'");
    expect(sql).toContain("'msg_local_project_inbound'");
    expect(sql).toContain("'msg_local_support_thread_resolved'");
    expect(sql).toContain("'thr_local_support_thread'");
    expect(sql).toContain("'drf_local_followup'");
    expect(sql).toContain("'drf_local_forward'");
    expect(sql).toContain('INSERT OR IGNORE INTO "messages"');
    expect(sql).toContain("'msg_local_bulk_0001'");
    expect(sql).toContain("'msg_local_bulk_0100'");
    expect(sql).toContain("'thr_local_bulk_0100'");
    expect(sql).toContain("'2026-08-14T16:00:00.000Z'");
  });

  it("executes only against local D1", () => {
    const source = readFileSync(
      new URL("../../../scripts/seed-local.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain('["d1", "execute", "DB", "--local"');
    expect(source).not.toContain('"--remote"');
  });
});
