import { env } from "cloudflare:test";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { beforeAll, describe, expect, it } from "vitest";

import { personalAccessTokens } from "../../../worker/db/schema";

import { applyCurrentMigrations } from "./current-migrations";

const stamp = "2026-08-19T18:00:00.000Z";

describe("personal access token schema", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  it("keeps the Drizzle PAT table aligned with the SQL migration", () => {
    const table = getTableConfig(personalAccessTokens);

    expect(table.name).toBe("personal_access_tokens");
    expect(table.columns.map(({ name }) => name)).toEqual([
      "id",
      "user_id",
      "name",
      "token_hash",
      "token_suffix",
      "created_at",
      "expires_at",
      "revoked_at"
    ]);
    expect(table.indexes.map(({ config }) => config.name).sort()).toEqual([
      "personal_access_tokens_list_idx",
      "personal_access_tokens_user_idx"
    ]);
    expect(table.foreignKeys).toHaveLength(1);
  });

  it("deletes a user's PAT rows through the foreign-key cascade", async () => {
    await insertUser("usr_pat_cascade");
    await insertPat({ id: "pat_cascade", userId: "usr_pat_cascade", tokenHash: "A".repeat(43) });

    await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind("usr_pat_cascade").run();

    const row = await env.DB.prepare(
      "SELECT id FROM personal_access_tokens WHERE id = 'pat_cascade'"
    ).first<{ id: string }>();
    expect(row).toBeNull();
  });

  it("rejects duplicate token hashes", async () => {
    await insertUser("usr_pat_unique");
    const tokenHash = "B".repeat(43);
    await insertPat({ id: "pat_unique_first", userId: "usr_pat_unique", tokenHash });

    await expect(
      insertPat({ id: "pat_unique_second", userId: "usr_pat_unique", tokenHash })
    ).rejects.toThrow();
  });

  it.each([
    { label: "empty name", values: { name: "" } },
    { label: "blank name", values: { name: "   " } },
    { label: "name longer than 80 characters", values: { name: "n".repeat(81) } },
    { label: "42-character hash", values: { tokenHash: "C".repeat(42) } },
    { label: "non-Base64url hash", values: { tokenHash: `${"C".repeat(42)}+` } },
    { label: "three-character suffix", values: { tokenSuffix: "abc" } },
    { label: "non-Base64url suffix", values: { tokenSuffix: "abc+" } }
  ])("rejects invalid PAT shape: $label", async ({ label, values }) => {
    const userId = `usr_pat_invalid_${label.replaceAll(/[^a-z0-9]/gu, "_")}`;
    await insertUser(userId);
    await expect(
      insertPat({
        id: `pat_invalid_${label.replaceAll(/[^a-z0-9]/gu, "_")}`,
        userId,
        tokenHash: `${label.length.toString(36).padStart(2, "0")}${"D".repeat(41)}`,
        ...values
      })
    ).rejects.toThrow();
  });

  it("rejects a malformed creation timestamp", async () => {
    await insertUser("usr_pat_bad_created");
    await expect(
      insertPat({
        id: "pat_bad_created",
        userId: "usr_pat_bad_created",
        tokenHash: `01${"E".repeat(41)}`,
        createdAt: "2026-08-19T18:00:00Z"
      })
    ).rejects.toThrow();
  });

  it("rejects a malformed expiry timestamp", async () => {
    await insertUser("usr_pat_bad_expiry");
    await expect(
      insertPat({
        id: "pat_bad_expiry",
        userId: "usr_pat_bad_expiry",
        tokenHash: `02${"E".repeat(41)}`,
        expiresAt: "2026-08-20T18:00:00Z"
      })
    ).rejects.toThrow();
  });

  it("rejects a malformed revocation timestamp", async () => {
    await insertUser("usr_pat_bad_revoked");
    await expect(
      insertPat({
        id: "pat_bad_revoked",
        userId: "usr_pat_bad_revoked",
        tokenHash: `03${"E".repeat(41)}`,
        revokedAt: "2026-08-20T18:00:00Z"
      })
    ).rejects.toThrow();
  });
});

async function insertUser(id: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO "user"
     (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
     VALUES (?, 'PAT schema user', ?, 1, ?, ?, 'member', 0)`
  )
    .bind(id, `${id}@example.com`, stamp, stamp)
    .run();
}

async function insertPat(input: {
  id: string;
  userId: string;
  tokenHash: string;
  name?: string;
  tokenSuffix?: string;
  createdAt?: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO personal_access_tokens
     (id, user_id, name, token_hash, token_suffix, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      input.id,
      input.userId,
      input.name ?? "Schema test token",
      input.tokenHash,
      input.tokenSuffix ?? "a1B2",
      input.createdAt ?? stamp,
      input.expiresAt ?? null,
      input.revokedAt ?? null
    )
    .run();
}
