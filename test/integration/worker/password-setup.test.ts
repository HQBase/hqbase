import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  completePasswordSetup,
  isPasswordSetupRequired
} from "../../../worker/auth/password-setup";
import { applyCurrentMigrations } from "./current-migrations";

const userId = "usr_password_setup";
const timestamp = "2026-08-19T12:00:00.000Z";

describe("password setup state", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM verification WHERE value = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM user_onboarding WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(userId).run();
    await env.DB.prepare(
      `INSERT INTO "user"
       (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
       VALUES (?, 'Password Setup User', 'password-setup@login.example', 1, ?, ?, 'member', 0)`
    )
      .bind(userId, timestamp, timestamp)
      .run();
  });

  it("reports only pending onboarding rows as required", async () => {
    await expect(isPasswordSetupRequired(env.DB, userId)).resolves.toBe(false);

    await insertOnboarding("pending");
    await expect(isPasswordSetupRequired(env.DB, userId)).resolves.toBe(true);

    await env.DB.prepare("UPDATE user_onboarding SET status = 'complete' WHERE user_id = ?")
      .bind(userId)
      .run();
    await expect(isPasswordSetupRequired(env.DB, userId)).resolves.toBe(false);
  });

  it("completes pending setup and removes only its reset tokens in one batch", async () => {
    await insertOnboarding("pending");
    await env.DB.batch([
      verification("ver_reset", "reset-password:reset-token", userId),
      verification("ver_other", "email-verification:email-token", userId),
      verification("ver_another_user", "reset-password:other-token", "usr_another")
    ]);

    await expect(completePasswordSetup(env.DB, userId)).resolves.toBe(true);

    const onboarding = await env.DB.prepare(
      "SELECT status, completed_at, updated_at FROM user_onboarding WHERE user_id = ?"
    )
      .bind(userId)
      .first<{ status: string; completed_at: string | null; updated_at: string }>();
    expect(onboarding?.status).toBe("complete");
    expect(onboarding?.completed_at).not.toBeNull();
    expect(onboarding?.updated_at).toBe(onboarding?.completed_at);

    const remaining = await env.DB.prepare("SELECT id FROM verification ORDER BY id").all<{
      id: string;
    }>();
    expect(remaining.results).toEqual([{ id: "ver_another_user" }, { id: "ver_other" }]);
  });

  it("still removes reset tokens when setup is already complete", async () => {
    await insertOnboarding("complete");
    await verification("ver_stale", "reset-password:stale-token", userId).run();

    await expect(completePasswordSetup(env.DB, userId)).resolves.toBe(false);

    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM verification WHERE id = 'ver_stale'"
    ).first<{ count: number }>();
    expect(row?.count).toBe(0);
  });
});

async function insertOnboarding(status: "pending" | "complete"): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_onboarding
     (user_id, method, status, completed_at, created_at, updated_at)
     VALUES (?, 'temporary_password', ?, ?, ?, ?)`
  )
    .bind(userId, status, status === "complete" ? timestamp : null, timestamp, timestamp)
    .run();
}

function verification(id: string, identifier: string, value: string): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, identifier, value, "2026-08-20T12:00:00.000Z", timestamp, timestamp);
}
