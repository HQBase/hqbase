import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import {
  getDefaultFromMailboxId,
  setDefaultFromMailboxId
} from "../../../worker/features/preferences/queries";
import { applyCurrentMigrations } from "./current-migrations";

describe("user mail preferences", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    const timestamp = "2026-08-19T12:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO "user"
         (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
         VALUES ('usr_preferences', 'Preferences User', 'preferences@login.example',
                 1, ?, ?, 'member', 0)`
      ).bind(timestamp, timestamp),
      env.DB.prepare(
        `INSERT INTO mailboxes (id, address, display_name, is_active, created_at, updated_at)
         VALUES
           ('mbx_preferences_one', 'one@example.com', 'One', 1, ?, ?),
           ('mbx_preferences_two', 'two@example.com', 'Two', 1, ?, ?)`
      ).bind(timestamp, timestamp, timestamp, timestamp)
    ]);
  });

  it("reads and updates one preference row through Drizzle", async () => {
    await expect(getDefaultFromMailboxId(env.DB, "usr_preferences")).resolves.toBeNull();

    await setDefaultFromMailboxId(env.DB, "usr_preferences", "mbx_preferences_one");
    await expect(getDefaultFromMailboxId(env.DB, "usr_preferences")).resolves.toBe(
      "mbx_preferences_one"
    );

    await setDefaultFromMailboxId(env.DB, "usr_preferences", "mbx_preferences_two");
    await expect(getDefaultFromMailboxId(env.DB, "usr_preferences")).resolves.toBe(
      "mbx_preferences_two"
    );

    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM user_mail_preferences
       WHERE user_id = 'usr_preferences'`
    ).first<{ count: number }>();
    expect(row?.count).toBe(1);
  });
});
