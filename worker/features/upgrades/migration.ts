import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { cloudflare } from "./cloudflare";
import { auditTransition, transitionUpgrade } from "./queries";
import type { ProWorkerBundle } from "./release";
import { readPreparedResources, requireCandidateRelease } from "./resources";
import type { UpgradeRecord } from "./types";
import { ensureCandidateValidator } from "./validator";

export async function migrateToPro(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  token: string,
  bundle: ProWorkerBundle,
  fetcher: typeof fetch = fetch
): Promise<UpgradeRecord> {
  if (!upgrade.accountId || !upgrade.d1DatabaseId) {
    throw new AppError(
      "UPGRADE_TARGET_INCOMPLETE",
      "The verified Community database is missing.",
      409
    );
  }
  const candidateRelease = requireCandidateRelease(await readPreparedResources(env.DB, upgrade.id));
  if (
    candidateRelease.version !== bundle.version ||
    candidateRelease.mainSha256 !== bundle.main.sha256
  ) {
    throw new AppError(
      "UPGRADE_RELEASE_CHANGED",
      "The signed Pro release changed after the candidate was prepared. Prepare and verify a new candidate before migration.",
      409
    );
  }
  const sourceRelease = await queryD1<{ installed_schema_version: number }>(
    token,
    upgrade.accountId,
    upgrade.d1DatabaseId,
    "SELECT installed_schema_version FROM app_release_state WHERE singleton = 1",
    fetcher
  );
  const sourceSchemaVersion = sourceRelease[0]?.installed_schema_version;
  if (
    typeof sourceSchemaVersion !== "number" ||
    !Number.isInteger(sourceSchemaVersion) ||
    !bundle.communityUpgrade.sourceSchemaVersions.includes(sourceSchemaVersion)
  ) {
    throw new AppError(
      "UPGRADE_SCHEMA_UNSUPPORTED",
      "The Community database schema is not supported by this Pro release.",
      409
    );
  }
  await queryD1(
    token,
    upgrade.accountId,
    upgrade.d1DatabaseId,
    `CREATE TABLE IF NOT EXISTS pro_applied_migrations (
       name TEXT PRIMARY KEY NOT NULL,
       sha256 TEXT NOT NULL,
       applied_at TEXT NOT NULL
     )`,
    fetcher
  );
  const rows = await queryD1<{ name: string; sha256: string }>(
    token,
    upgrade.accountId,
    upgrade.d1DatabaseId,
    "SELECT name, sha256 FROM pro_applied_migrations",
    fetcher
  );
  const applied = new Map(rows.map((row) => [row.name, row.sha256]));
  for (const migration of bundle.migrations) {
    const digest = applied.get(migration.name);
    if (digest) {
      if (digest !== migration.sha256) {
        throw new AppError(
          "UPGRADE_MIGRATION_DRIFT",
          "The database contains an incompatible Pro migration record.",
          409
        );
      }
      continue;
    }
    await queryD1Batch(
      token,
      upgrade.accountId,
      upgrade.d1DatabaseId,
      [
        { sql: migration.sql },
        {
          sql: "INSERT INTO pro_applied_migrations (name, sha256, applied_at) VALUES (?, ?, datetime('now'))",
          params: [migration.name, migration.sha256]
        }
      ],
      fetcher
    );
  }
  return transitionUpgrade(env.DB, upgrade.id, "migration_started", "migration_complete", {
    error_code: null,
    recovery_action: null
  });
}

export async function verifyProCandidate(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  token: string,
  orchestrationSecret: string,
  fetcher: typeof fetch = fetch
): Promise<UpgradeRecord> {
  const candidateRelease = requireCandidateRelease(await readPreparedResources(env.DB, upgrade.id));
  if (!upgrade.candidateVersionId) {
    throw new AppError("UPGRADE_CANDIDATE_MISSING", "The Pro candidate is missing.", 409);
  }
  const validator = await ensureCandidateValidator(env, upgrade, token, fetcher);
  const response = await fetchCandidateVerification(validator, orchestrationSecret, fetcher);
  const result = (await response.json().catch(() => null)) as {
    ok?: boolean;
    version?: string;
    edition?: string;
  } | null;
  if (
    !response.ok ||
    !result?.ok ||
    result.edition !== "pro" ||
    result.version !== candidateRelease.version
  ) {
    await auditTransition(env.DB, upgrade.id, "candidate_validation_rejected", "failure", {
      status: response.status
    });
    throw new AppError(
      "UPGRADE_CANDIDATE_VERIFICATION_FAILED",
      "The Pro candidate did not pass isolated validation.",
      409
    );
  }
  return transitionUpgrade(env.DB, upgrade.id, "migration_complete", "candidate_verified", {
    error_code: null,
    recovery_action: null
  });
}

export async function fetchCandidateVerification(
  url: string,
  orchestrationSecret: string,
  fetcher: typeof fetch = fetch,
  wait: (milliseconds: number) => Promise<void> = delay
): Promise<Response> {
  const attempts = 45;
  let attempt = 0;
  while (true) {
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${orchestrationSecret}`,
          "cache-control": "no-store"
        }
      });
      if (response.status !== 404 && response.status < 500) return response;
      if (attempt === attempts - 1) return response;
    } catch (error) {
      if (attempt === attempts - 1) throw error;
    }
    attempt += 1;
    await wait(1_000);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function queryD1<T = Record<string, unknown>>(
  token: string,
  accountId: string,
  databaseId: string,
  sql: string,
  fetcher: typeof fetch
): Promise<T[]> {
  const result = await cloudflare<Array<{ results?: T[]; success?: boolean }>>(
    token,
    `/accounts/${accountId}/d1/database/${databaseId}/query`,
    { method: "POST", body: JSON.stringify({ sql }) },
    fetcher
  );
  const first = result[0];
  if (!first || first.success === false) {
    throw new AppError("UPGRADE_MIGRATION_FAILED", "The Pro database migration failed.", 502);
  }
  return first.results ?? [];
}

async function queryD1Batch(
  token: string,
  accountId: string,
  databaseId: string,
  statements: Array<{ sql: string; params?: unknown[] }>,
  fetcher: typeof fetch
): Promise<void> {
  const result = await cloudflare<Array<{ success?: boolean }>>(
    token,
    `/accounts/${accountId}/d1/database/${databaseId}/query`,
    { method: "POST", body: JSON.stringify({ batch: statements }) },
    fetcher
  );
  if (!d1BatchSucceeded(result)) {
    throw new AppError("UPGRADE_MIGRATION_FAILED", "The Pro database migration failed.", 502);
  }
}

export function d1BatchSucceeded(result: Array<{ success?: boolean }>): boolean {
  return result.length > 0 && result.every((entry) => entry.success !== false);
}
