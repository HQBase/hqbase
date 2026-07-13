import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import initialMigration from "../../../migrations/0001_initial.sql?raw";
import updatesMigration from "../../../migrations/0002_updates.sql?raw";

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
});

describe("Community update migration", () => {
  it("creates a versioned release marker and recovery history", async () => {
    await expect(
      env.DB.prepare(
        "SELECT edition, installed_version, installed_schema_version FROM app_release_state"
      ).first()
    ).resolves.toMatchObject({
      edition: "community",
      installed_version: "0.1.1",
      installed_schema_version: 2
    });
    await env.DB.prepare(
      "INSERT INTO app_update_history (id, from_version, to_version, checkpoint_bookmark, worker_version, state, started_at) VALUES ('update-1', '0.1.0', '0.2.0', 'bookmark', 'worker-version', 'started', datetime('now'))"
    ).run();
    await expect(
      env.DB.prepare("SELECT state FROM app_update_history WHERE id = 'update-1'").first()
    ).resolves.toMatchObject({ state: "started" });
  });
});
