import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  authenticatePersonalAccessToken,
  PersonalAccessTokenError
} from "../../../worker/auth/personal-access-token-principal";
import { generatePersonalAccessToken } from "../../../worker/auth/personal-access-token-secret";
import { applyCurrentMigrations } from "./current-migrations";

const now = Date.parse("2026-08-20T18:00:00.000Z");
const userId = "usr_pat_principal";
let bearer = "";

describe("personal access token principal lookup", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM personal_access_tokens WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM user_onboarding WHERE user_id = ?").bind(userId).run();
    await env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(userId).run();
    await env.DB.prepare(
      `INSERT INTO "user"
       (id, name, email, emailVerified, createdAt, updatedAt, role, banned, banExpires)
       VALUES (?, 'PAT Principal', 'pat-principal@example.com', 1, ?, ?, 'admin', NULL, NULL)`
    )
      .bind(userId, new Date(now).toISOString(), new Date(now).toISOString())
      .run();
    const generated = await generatePersonalAccessToken();
    bearer = generated.token;
    await env.DB.prepare(
      `INSERT INTO personal_access_tokens
       (id, user_id, name, token_hash, token_suffix, created_at, expires_at, revoked_at)
       VALUES ('pat_principal_d1', ?, 'D1 principal', ?, ?, ?, NULL, NULL)`
    )
      .bind(userId, generated.tokenHash, generated.tokenSuffix, new Date(now).toISOString())
      .run();
  });

  it("returns live user metadata for a valid token", async () => {
    await expectValidPrincipal();
  });

  it("rejects expiry equality", async () => {
    await updateToken("expires_at", new Date(now).toISOString());
    await expectPrincipalError();
  });

  it("rejects revocation", async () => {
    await updateToken("revoked_at", "2026-08-20T17:00:00.000Z");
    await expectPrincipalError();
  });

  it("rejects pending password setup", async () => {
    await env.DB.prepare(
      `INSERT INTO user_onboarding
       (user_id, method, status, created_by, invitation_sent_at, completed_at, created_at, updated_at)
       VALUES (?, 'temporary_password', 'pending', NULL, NULL, NULL, ?, ?)`
    )
      .bind(userId, new Date(now).toISOString(), new Date(now).toISOString())
      .run();
    await expectPrincipalError();
  });

  it("rejects a permanent ban", async () => {
    await env.DB.prepare('UPDATE "user" SET banned = 1, banExpires = NULL WHERE id = ?')
      .bind(userId)
      .run();
    await expectPrincipalError();
  });

  it("accepts an expired finite temporary ban", async () => {
    await env.DB.prepare('UPDATE "user" SET banned = 1, banExpires = ? WHERE id = ?')
      .bind("2026-08-20T17:59:59.999Z", userId)
      .run();
    await expectValidPrincipal();
  });

  it("rejects an unsupported stored authorization value", async () => {
    await env.DB.prepare('UPDATE "user" SET banned = 2 WHERE id = ?').bind(userId).run();
    await expectPrincipalError();
  });
});

async function updateToken(column: "expires_at" | "revoked_at", value: string): Promise<void> {
  const query =
    column === "expires_at"
      ? "UPDATE personal_access_tokens SET expires_at = ? WHERE id = 'pat_principal_d1'"
      : "UPDATE personal_access_tokens SET revoked_at = ? WHERE id = 'pat_principal_d1'";
  await env.DB.prepare(query).bind(value).run();
}

async function expectValidPrincipal(): Promise<void> {
  const principal = await authenticatePersonalAccessToken(env.DB, bearer, now);
  expect(principal).toEqual({
    tokenId: "pat_principal_d1",
    user: {
      id: userId,
      email: "pat-principal@example.com",
      name: "PAT Principal",
      role: "admin"
    }
  });
}

async function expectPrincipalError(): Promise<void> {
  try {
    await authenticatePersonalAccessToken(env.DB, bearer, now);
  } catch (error) {
    expect(error).toBeInstanceOf(PersonalAccessTokenError);
    return;
  }
  throw new Error("Expected personal access token access to be rejected.");
}
