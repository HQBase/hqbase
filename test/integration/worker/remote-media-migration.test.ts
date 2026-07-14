import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import initialMigration from "../../../migrations/0001_initial.sql?raw";
import updatesMigration from "../../../migrations/0002_updates.sql?raw";
import remoteMediaMigration from "../../../migrations/0003_remote_media_preferences.sql?raw";
import {
  isRemoteMediaTrusted,
  normalizeSenderAddress,
  trustRemoteMediaSender
} from "../../../worker/features/messages/remote-media";

const userId = "usr_remote_media";

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
  await env.DB.prepare(
    `INSERT INTO "user"
     (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
     VALUES (?, 'Reader', 'reader@example.com', 1, datetime('now'), datetime('now'), 'member', 0)`
  )
    .bind(userId)
    .run();
  await applyMigration(remoteMediaMigration);
});

describe("remote-media preference migration", () => {
  it("applies to a populated database and starts with no trusted senders", async () => {
    await expect(
      env.DB.prepare("SELECT COUNT(*) AS count FROM message_sender_preferences").first()
    ).resolves.toMatchObject({ count: 0 });
    await expect(isRemoteMediaTrusted(env.DB, userId, "sender@example.com")).resolves.toBe(false);
    await expect(
      env.DB.prepare(
        "SELECT installed_schema_version FROM app_release_state WHERE singleton = 1"
      ).first()
    ).resolves.toMatchObject({ installed_schema_version: 3 });
  });

  it("stores normalized per-user trust and retries idempotently", async () => {
    await trustRemoteMediaSender(env.DB, userId, " Sender@Example.COM ");
    await expect(isRemoteMediaTrusted(env.DB, userId, "sender@example.com")).resolves.toBe(true);
    await applyMigration(remoteMediaMigration);
    await expect(isRemoteMediaTrusted(env.DB, userId, "SENDER@example.com")).resolves.toBe(true);
    expect(normalizeSenderAddress(" Sender@Example.COM ")).toBe("sender@example.com");
  });

  it("rejects invalid preference state and cascades user deletion", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO message_sender_preferences
         (user_id, sender_address, load_remote_media, created_at, updated_at)
         VALUES (?, 'bad@example.com', 2, datetime('now'), datetime('now'))`
      )
        .bind(userId)
        .run()
    ).rejects.toThrow();
    await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(userId).run();
    await expect(
      env.DB.prepare("SELECT COUNT(*) AS count FROM message_sender_preferences").first()
    ).resolves.toMatchObject({ count: 0 });
  });
});
