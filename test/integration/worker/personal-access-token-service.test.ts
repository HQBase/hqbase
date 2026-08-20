import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPersonalAccessToken,
  listPersonalAccessTokens,
  revokePersonalAccessToken
} from "../../../worker/features/personal-access-tokens/service";
import { AppError } from "../../../worker/lib/errors";
import { assertSecretSafeAbsent } from "../../helpers/secret-safe-assertions";
import { applyCurrentMigrations } from "./current-migrations";

const now = Date.parse("2026-08-20T18:00:00.000Z");
const nowIso = new Date(now).toISOString();

describe("personal access token service", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  beforeEach(async () => {
    await env.DB.prepare(
      "DELETE FROM audit_events WHERE action LIKE 'personal_access_token.%'"
    ).run();
    await env.DB.prepare("DELETE FROM personal_access_tokens").run();
    await env.DB.prepare(`DELETE FROM "user" WHERE id LIKE 'usr_pat_service_%'`).run();
    await Promise.all([
      insertUser("usr_pat_service_owner", "Workspace Owner", "owner"),
      insertUser("usr_pat_service_admin", "Workspace Admin", "admin"),
      insertUser("usr_pat_service_member", "Workspace Member", "member"),
      insertUser("usr_pat_service_other", "Other Member", "member")
    ]);
  });

  it("lists only active visible PATs in stable order", async () => {
    await insertPat("pat_owner_z", "usr_pat_service_owner", nowIso, null, null);
    await insertPat("pat_owner_a", "usr_pat_service_owner", nowIso, null, null);
    await insertPat(
      "pat_admin_active",
      "usr_pat_service_admin",
      "2026-08-20T17:00:00.000Z",
      "2026-08-21T18:00:00.000Z",
      null
    );
    await insertPat(
      "pat_member_active",
      "usr_pat_service_member",
      "2026-08-20T16:00:00.000Z",
      null,
      null
    );
    await insertPat(
      "pat_expiry_equal",
      "usr_pat_service_admin",
      "2026-08-20T15:00:00.000Z",
      nowIso,
      null
    );
    await insertPat(
      "pat_expired",
      "usr_pat_service_member",
      "2026-08-20T14:00:00.000Z",
      "2026-08-20T17:59:59.999Z",
      null
    );
    await insertPat(
      "pat_revoked",
      "usr_pat_service_owner",
      "2026-08-20T13:00:00.000Z",
      null,
      "2026-08-20T17:00:00.000Z"
    );

    const owner = await listPersonalAccessTokens(env.DB, {
      userId: "usr_pat_service_owner",
      role: "owner",
      now
    });
    expect(owner.personalAccessTokens.map(({ id }) => id)).toEqual([
      "pat_owner_z",
      "pat_owner_a",
      "pat_admin_active",
      "pat_member_active"
    ]);

    const admin = await listPersonalAccessTokens(env.DB, {
      userId: "usr_pat_service_admin",
      role: "admin",
      now
    });
    expect(admin.personalAccessTokens.map(({ id }) => id)).toEqual(["pat_admin_active"]);

    const member = await listPersonalAccessTokens(env.DB, {
      userId: "usr_pat_service_member",
      role: "member",
      now
    });
    expect(member.personalAccessTokens.map(({ id }) => id)).toEqual(["pat_member_active"]);
    expect(Object.keys(member.personalAccessTokens[0] ?? {})).toEqual([
      "id",
      "userId",
      "ownerName",
      "name",
      "tokenSuffix",
      "createdAt",
      "expiresAt"
    ]);
  });

  it("enforces the active-token limit per user", async () => {
    for (let index = 0; index < 10; index += 1) {
      await insertPat(
        `pat_limit_${index}`,
        "usr_pat_service_owner",
        `2026-08-20T17:${String(index).padStart(2, "0")}:00.000Z`,
        null,
        null
      );
    }

    const limitError = await captureAppError(
      createPersonalAccessToken(env.DB, {
        userId: "usr_pat_service_owner",
        correlationId: "request_owner_limit",
        name: "Owner limit",
        expiresAt: null,
        now
      })
    );
    expect(limitError.code).toBe("PERSONAL_ACCESS_TOKEN_LIMIT_REACHED");
    expect(limitError.status).toBe(409);

    const other = await createPersonalAccessToken(env.DB, {
      userId: "usr_pat_service_admin",
      correlationId: "request_other_create",
      name: "Admin token",
      expiresAt: null,
      now
    });
    expect(/^hqb_pat_[A-Za-z0-9_-]{43}$/u.test(other.token)).toBe(true);

    const counts = await env.DB.prepare(
      `SELECT user_id AS userId, COUNT(*) AS count FROM personal_access_tokens
       WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
       GROUP BY user_id ORDER BY user_id`
    )
      .bind(nowIso)
      .all<{ userId: string; count: number }>();
    expect(counts.results).toEqual([
      { userId: "usr_pat_service_admin", count: 1 },
      { userId: "usr_pat_service_owner", count: 10 }
    ]);
  });

  it("commits creation with one secret-free audit event", async () => {
    const created = await createPersonalAccessToken(env.DB, {
      userId: "usr_pat_service_member",
      correlationId: "request_create_audit",
      name: "Audited token",
      expiresAt: null,
      now
    });
    expect(/^hqb_pat_[A-Za-z0-9_-]{43}$/u.test(created.token)).toBe(true);

    const stored = await env.DB.prepare(
      "SELECT token_hash AS tokenHash FROM personal_access_tokens WHERE id = ?"
    )
      .bind(created.personalAccessToken.id)
      .first<{ tokenHash: string }>();
    if (!stored) throw new Error("Expected the created PAT row.");
    const audit = await env.DB.prepare(
      `SELECT action, actor_type AS actorType, actor_id AS actorId,
              resource_type AS resourceType, resource_id AS resourceId, outcome, metadata_json
       FROM audit_events WHERE correlation_id = 'request_create_audit'`
    ).first<{
      action: string;
      actorType: string;
      actorId: string;
      resourceType: string;
      resourceId: string;
      outcome: string;
      metadata_json: string;
    }>();
    expect(audit).toEqual({
      action: "personal_access_token.create",
      actorType: "user",
      actorId: "usr_pat_service_member",
      resourceType: "personal_access_token",
      resourceId: created.personalAccessToken.id,
      outcome: "success",
      metadata_json: "{}"
    });
    assertSecretSafeAbsent(JSON.stringify(audit), [created.token, stored.tokenHash]);
  });

  it("rolls back creation when its audit statement fails", async () => {
    await env.DB.prepare(
      `CREATE TRIGGER fail_pat_create_audit
       BEFORE INSERT ON audit_events
       WHEN NEW.action = 'personal_access_token.create'
       BEGIN
         SELECT RAISE(ABORT, 'injected create audit failure');
       END`
    ).run();
    try {
      await expect(
        createPersonalAccessToken(env.DB, {
          userId: "usr_pat_service_member",
          correlationId: "request_create_rollback",
          name: "Rollback token",
          expiresAt: null,
          now
        })
      ).rejects.toThrow("injected create audit failure");
    } finally {
      await env.DB.prepare("DROP TRIGGER fail_pat_create_audit").run();
    }

    const tokenCount = await countRows(
      "SELECT COUNT(*) AS count FROM personal_access_tokens WHERE user_id = 'usr_pat_service_member'"
    );
    const auditCount = await countRows(
      "SELECT COUNT(*) AS count FROM audit_events WHERE correlation_id = 'request_create_rollback'"
    );
    expect(tokenCount).toBe(0);
    expect(auditCount).toBe(0);
  });

  it.each([
    { label: "admin", actorId: "usr_pat_service_admin", actorRole: "admin" as const },
    { label: "member", actorId: "usr_pat_service_member", actorRole: "member" as const }
  ])("does not disclose or revoke a foreign PAT to an $label", async ({ actorId, actorRole }) => {
    await insertPat("pat_foreign", "usr_pat_service_owner", nowIso, null, null);
    await expect(
      revokePersonalAccessToken(env.DB, {
        id: "pat_foreign",
        actorId,
        actorRole,
        correlationId: `request_foreign_${actorRole}`,
        now
      })
    ).resolves.toBe("not-found");

    const row = await env.DB.prepare(
      "SELECT revoked_at AS revokedAt FROM personal_access_tokens WHERE id = 'pat_foreign'"
    ).first<{ revokedAt: string | null }>();
    expect(row?.revokedAt).toBeNull();
    expect(
      await countRows(
        `SELECT COUNT(*) AS count FROM audit_events WHERE correlation_id = 'request_foreign_${actorRole}'`
      )
    ).toBe(0);
  });

  it("rolls back the revoke audit when the state update fails", async () => {
    await insertPat("pat_revoke_rollback", "usr_pat_service_member", nowIso, null, null);
    await env.DB.prepare(
      `CREATE TRIGGER fail_pat_revoke_update
       BEFORE UPDATE OF revoked_at ON personal_access_tokens
       WHEN NEW.id = 'pat_revoke_rollback' AND NEW.revoked_at IS NOT NULL
       BEGIN
         SELECT RAISE(ABORT, 'injected revoke update failure');
       END`
    ).run();
    try {
      await expect(
        revokePersonalAccessToken(env.DB, {
          id: "pat_revoke_rollback",
          actorId: "usr_pat_service_member",
          actorRole: "member",
          correlationId: "request_revoke_rollback",
          now
        })
      ).rejects.toThrow("injected revoke update failure");
    } finally {
      await env.DB.prepare("DROP TRIGGER fail_pat_revoke_update").run();
    }

    const row = await env.DB.prepare(
      "SELECT revoked_at AS revokedAt FROM personal_access_tokens WHERE id = 'pat_revoke_rollback'"
    ).first<{ revokedAt: string | null }>();
    expect(row?.revokedAt).toBeNull();
    expect(
      await countRows(
        "SELECT COUNT(*) AS count FROM audit_events WHERE correlation_id = 'request_revoke_rollback'"
      )
    ).toBe(0);
  });

  it("records one state change and one audit under concurrent revocation", async () => {
    await insertPat("pat_concurrent_revoke", "usr_pat_service_member", nowIso, null, null);
    const results = await Promise.all([
      revokePersonalAccessToken(env.DB, {
        id: "pat_concurrent_revoke",
        actorId: "usr_pat_service_member",
        actorRole: "member",
        correlationId: "request_revoke_first",
        now
      }),
      revokePersonalAccessToken(env.DB, {
        id: "pat_concurrent_revoke",
        actorId: "usr_pat_service_member",
        actorRole: "member",
        correlationId: "request_revoke_second",
        now: now + 1
      })
    ]);
    expect(results.sort()).toEqual(["already-revoked", "revoked"]);
    expect(
      await countRows(
        `SELECT COUNT(*) AS count FROM audit_events
         WHERE action = 'personal_access_token.revoke' AND resource_id = 'pat_concurrent_revoke'`
      )
    ).toBe(1);
  });
});

async function insertUser(id: string, name: string, role: "owner" | "admin" | "member") {
  await env.DB.prepare(
    `INSERT INTO "user"
     (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
     VALUES (?, ?, ?, 1, ?, ?, ?, 0)`
  )
    .bind(id, name, `${id}@example.com`, nowIso, nowIso, role)
    .run();
}

async function insertPat(
  id: string,
  userId: string,
  createdAt: string,
  expiresAt: string | null,
  revokedAt: string | null
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO personal_access_tokens
     (id, user_id, name, token_hash, token_suffix, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, 'a1B2', ?, ?, ?)`
  )
    .bind(id, userId, `Token ${id}`, fixtureHash(id), createdAt, expiresAt, revokedAt)
    .run();
}

function fixtureHash(id: string): string {
  return id
    .replaceAll(/[^A-Za-z0-9_-]/gu, "_")
    .padEnd(43, "A")
    .slice(0, 43);
}

async function countRows(query: string): Promise<number> {
  const row = await env.DB.prepare(query).first<{ count: number }>();
  return row?.count ?? -1;
}

async function captureAppError(operation: Promise<unknown>): Promise<AppError> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof AppError) return error;
  }
  throw new Error("Expected an AppError.");
}
