import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import initialMigration from "../../../migrations/0001_initial.sql?raw";
import updatesMigration from "../../../migrations/0002_updates.sql?raw";
import preferencesMigration from "../../../migrations/0003_remote_media_preferences.sql?raw";
import upgradeMigration from "../../../migrations/0004_in_place_pro_upgrade.sql?raw";
import { ensureInstallationIdentity } from "../../../worker/features/upgrades/queries";
import {
  readPreparedResources,
  recordPreparedSecretOwnership
} from "../../../worker/features/upgrades/resources";

async function applyMigration(source: string): Promise<void> {
  for (const statement of source
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
}

beforeAll(async () => {
  await applyMigration(initialMigration);
  await applyMigration(updatesMigration);
  await applyMigration(preferencesMigration);
  await applyMigration(upgradeMigration);
});

describe("in-place Community to Pro migration", () => {
  it("stores one durable installation identity and rejects Worker drift", async () => {
    const created = await ensureInstallationIdentity(env.DB, "custom-community");
    expect(created.installationId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(
      ensureInstallationIdentity(env.DB, "custom-community", created.installationId)
    ).resolves.toEqual(created);
    await expect(ensureInstallationIdentity(env.DB, "other-worker")).rejects.toThrow("Worker name");
  });

  it("enforces a durable single-upgrade lock without storing credentials", async () => {
    const identity = await ensureInstallationIdentity(env.DB, "custom-community");
    const values = [
      crypto.randomUUID(),
      identity.installationId,
      identity.workerName,
      "https://custom-community.example.workers.dev",
      "nonce-hash",
      "c".repeat(43),
      new Date().toISOString(),
      new Date(Date.now() + 60_000).toISOString(),
      new Date().toISOString()
    ];
    const insert = () =>
      env.DB.prepare(
        `INSERT INTO community_pro_upgrades
         (id, installation_id, worker_name, workspace_origin, install_mode,
          purchase_nonce_hash, code_challenge, state, created_at, expires_at, updated_at)
         VALUES (?, ?, ?, ?, 'community_upgrade', ?, ?, 'created', ?, ?, ?)`
      )
        .bind(...values)
        .run();
    await insert();
    values[0] = crypto.randomUUID();
    await expect(insert()).rejects.toThrow();

    const columns = await env.DB.prepare("PRAGMA table_info(community_pro_upgrades)").all<{
      name: string;
    }>();
    expect(columns.results.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(["cloudflare_token", "license_key", "secret_value"])
    );
  });

  it("records resource ownership without secret values", async () => {
    const row = await env.DB.prepare(
      "SELECT id FROM community_pro_upgrades ORDER BY created_at DESC LIMIT 1"
    ).first<{ id: string }>();
    expect(row?.id).toBeTruthy();
    const prepared = {
      jobsQueue: "custom-pro-jobs",
      deadLetterQueue: "custom-pro-dlq",
      resources: [
        {
          type: "d1" as const,
          name: "DB",
          id: "database-id",
          ownership: "reused" as const,
          disposition: "persistent" as const
        }
      ]
    };
    await env.DB.prepare(
      "UPDATE community_pro_upgrades SET state = 'resources_prepared', created_resources_json = ? WHERE id = ?"
    )
      .bind(JSON.stringify(prepared), row?.id)
      .run();
    await recordPreparedSecretOwnership(
      env.DB,
      row?.id ?? "",
      prepared,
      ["BETTER_AUTH_SECRET", "PRO_BRIDGE_TOKEN"],
      ["PRO_BRIDGE_TOKEN", "PRO_ENTITLEMENT_SECRET", "HQBASE_SETUP_OAUTH_ACCESS_TOKEN"]
    );
    const stored = await readPreparedResources(env.DB, row?.id ?? "");
    expect(stored.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "PRO_BRIDGE_TOKEN", ownership: "reused" }),
        expect.objectContaining({ name: "PRO_ENTITLEMENT_SECRET", ownership: "created" }),
        expect.objectContaining({
          name: "HQBASE_SETUP_OAUTH_ACCESS_TOKEN",
          ownership: "created",
          disposition: "disposable"
        })
      ])
    );
    expect(JSON.stringify(stored)).not.toContain("secret-value");
  });
});
