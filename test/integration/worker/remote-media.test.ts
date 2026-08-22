import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  isRemoteMediaTrusted,
  trustRemoteMediaSender
} from "../../../worker/features/messages/remote-media";
import { applyCurrentMigrations } from "./current-migrations";

describe("remote media sender preferences", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    const timestamp = "2026-08-19T12:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO "user"
       (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
       VALUES ('usr_remote_media', 'Remote Media User', 'remote-media@login.example',
               1, ?, ?, 'member', 0)`
    )
      .bind(timestamp, timestamp)
      .run();
  });

  beforeEach(async () => {
    await env.DB.prepare(
      "DELETE FROM message_sender_preferences WHERE user_id = 'usr_remote_media'"
    ).run();
  });

  it("inserts and reads a normalized sender preference through Drizzle", async () => {
    await expect(
      isRemoteMediaTrusted(env.DB, "usr_remote_media", "sender@example.com")
    ).resolves.toBe(false);

    await trustRemoteMediaSender(env.DB, "usr_remote_media", " Sender@Example.COM ");

    await expect(
      isRemoteMediaTrusted(env.DB, "usr_remote_media", "SENDER@EXAMPLE.COM")
    ).resolves.toBe(true);
    await expect(
      env.DB.prepare(
        `SELECT sender_address, load_remote_media
         FROM message_sender_preferences
         WHERE user_id = 'usr_remote_media'`
      ).first()
    ).resolves.toEqual({ sender_address: "sender@example.com", load_remote_media: 1 });
  });

  it("updates the existing case-insensitive sender key", async () => {
    await trustRemoteMediaSender(env.DB, "usr_remote_media", "sender@example.com");
    await env.DB.prepare(
      `UPDATE message_sender_preferences
       SET sender_address = 'Sender@Example.COM', load_remote_media = 0
       WHERE user_id = 'usr_remote_media'`
    ).run();

    await trustRemoteMediaSender(env.DB, "usr_remote_media", "sender@example.com");

    const rows = await env.DB.prepare(
      `SELECT sender_address, load_remote_media
       FROM message_sender_preferences
       WHERE user_id = 'usr_remote_media'`
    ).all<{ sender_address: string; load_remote_media: number }>();
    expect(rows.results).toEqual([{ sender_address: "Sender@Example.COM", load_remote_media: 1 }]);
  });
});
