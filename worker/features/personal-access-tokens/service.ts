import { generatePersonalAccessToken } from "../../auth/personal-access-token-secret";
import { newId } from "../../db/client";
import { AppError } from "../../lib/errors";
import type { WorkspaceRole } from "../../lib/validation";
import { prepareAuditInsert } from "../audit/service";

import type {
  CreatePersonalAccessTokenInput,
  PersonalAccessTokenList,
  PersonalAccessTokenMetadata,
  PersonalAccessTokenMetadataRow
} from "./types";
import { readPersonalAccessTokenMetadata } from "./validation";

export const MAX_ACTIVE_PERSONAL_ACCESS_TOKENS = 10;

export async function listPersonalAccessTokens(
  db: D1Database,
  input: { userId: string; role: WorkspaceRole; now?: number }
): Promise<PersonalAccessTokenList> {
  const timestamp = new Date(input.now ?? Date.now()).toISOString();
  const userFilter = input.role === "owner" ? "" : " AND pat.user_id = ?";
  const bindings = input.role === "owner" ? [timestamp] : [timestamp, input.userId];
  const rows = await db
    .prepare(
      `SELECT pat.id AS id, pat.user_id AS userId, owner.name AS ownerName,
              pat.name AS name, pat.token_suffix AS tokenSuffix,
              pat.created_at AS createdAt, pat.expires_at AS expiresAt
       FROM personal_access_tokens pat
       JOIN "user" owner ON owner.id = pat.user_id
       WHERE pat.revoked_at IS NULL AND (pat.expires_at IS NULL OR pat.expires_at > ?)
       ${userFilter}
       ORDER BY pat.created_at DESC, pat.id DESC`
    )
    .bind(...bindings)
    .all<PersonalAccessTokenMetadataRow>();

  return { personalAccessTokens: rows.results.map(readPersonalAccessTokenMetadata) };
}

export async function createPersonalAccessToken(
  db: D1Database,
  input: CreatePersonalAccessTokenInput & {
    userId: string;
    correlationId: string;
    now?: number;
  }
): Promise<{ personalAccessToken: PersonalAccessTokenMetadata; token: string }> {
  const timestamp = new Date(input.now ?? Date.now()).toISOString();
  const id = newId("pat");
  const generated = await generatePersonalAccessToken();
  const insert = db
    .prepare(
      `INSERT INTO personal_access_tokens
       (id, user_id, name, token_hash, token_suffix, created_at, expires_at, revoked_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, NULL
       WHERE (
         SELECT COUNT(*) FROM personal_access_tokens
         WHERE user_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
       ) < ${MAX_ACTIVE_PERSONAL_ACCESS_TOKENS}`
    )
    .bind(
      id,
      input.userId,
      input.name,
      generated.tokenHash,
      generated.tokenSuffix,
      timestamp,
      input.expiresAt,
      input.userId,
      timestamp
    );
  const audit = prepareAuditInsert(
    db,
    {
      correlationId: input.correlationId,
      actorType: "user",
      actorId: input.userId,
      action: "personal_access_token.create",
      resourceType: "personal_access_token",
      resourceId: id,
      outcome: "success"
    },
    { kind: "personal-access-token-exists", id }
  );

  const results = await db.batch([insert, audit]);
  const insertChanges = results[0]?.meta.changes;
  const auditChanges = results[1]?.meta.changes;
  if (insertChanges === 0 && auditChanges === 0) {
    throw new AppError(
      "PERSONAL_ACCESS_TOKEN_LIMIT_REACHED",
      `This user already has ${MAX_ACTIVE_PERSONAL_ACCESS_TOKENS} active personal access tokens.`,
      409
    );
  }
  if (insertChanges !== 1 || auditChanges !== 1) throw invalidLifecycleResult();

  const row = await db
    .prepare(
      `SELECT pat.id AS id, pat.user_id AS userId, owner.name AS ownerName,
              pat.name AS name, pat.token_suffix AS tokenSuffix,
              pat.created_at AS createdAt, pat.expires_at AS expiresAt
       FROM personal_access_tokens pat
       JOIN "user" owner ON owner.id = pat.user_id
       WHERE pat.id = ?`
    )
    .bind(id)
    .first<PersonalAccessTokenMetadataRow>();
  if (!row) throw invalidLifecycleResult();

  return {
    personalAccessToken: readPersonalAccessTokenMetadata(row),
    token: generated.token
  };
}

export async function revokePersonalAccessToken(
  db: D1Database,
  input: {
    id: string;
    actorId: string;
    actorRole: WorkspaceRole;
    correlationId: string;
    now?: number;
  }
): Promise<"revoked" | "already-revoked" | "not-found"> {
  const timestamp = new Date(input.now ?? Date.now()).toISOString();
  const ownerWide = input.actorRole === "owner";
  const userSql = ownerWide ? "" : " AND user_id = ?";
  const userBindings = ownerWide ? [] : [input.actorId];
  const audit = prepareAuditInsert(
    db,
    {
      correlationId: input.correlationId,
      actorType: "user",
      actorId: input.actorId,
      action: "personal_access_token.revoke",
      resourceType: "personal_access_token",
      resourceId: input.id,
      outcome: "success"
    },
    {
      kind: "active-personal-access-token",
      id: input.id,
      ...(ownerWide ? {} : { userId: input.actorId })
    }
  );
  const update = db
    .prepare(
      `UPDATE personal_access_tokens SET revoked_at = ?
       WHERE id = ? AND revoked_at IS NULL${userSql}`
    )
    .bind(timestamp, input.id, ...userBindings);
  const target = db
    .prepare(`SELECT id FROM personal_access_tokens WHERE id = ?${userSql}`)
    .bind(input.id, ...userBindings);

  const results = await db.batch([audit, update, target]);
  const auditChanges = results[0]?.meta.changes;
  const updateChanges = results[1]?.meta.changes;
  const targetRows = results[2]?.results;
  if (!Array.isArray(targetRows)) throw invalidLifecycleResult();
  const targetExists = targetRows.length > 0;

  if (auditChanges === 1 && updateChanges === 1 && targetExists) return "revoked";
  if (auditChanges === 0 && updateChanges === 0) {
    return targetExists ? "already-revoked" : "not-found";
  }
  throw invalidLifecycleResult();
}

function invalidLifecycleResult(): AppError {
  return new AppError("INTERNAL_ERROR", "Personal access token lifecycle result is invalid.", 500);
}
