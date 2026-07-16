import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { getEntitlementStatus } from "../billing/queries";
import { activateWorkspace } from "../billing/service";
import { deleteTemporarySecrets, revokeGrant, verifyPromotedService } from "./in-place-cloudflare";

type UpgradeRow = {
  id: string;
  installation_id: string;
  worker_name: string;
  workspace_origin: string;
  state: string;
  account_id: string;
  active_version_id: string;
  candidate_version_id: string;
  d1_database_id: string;
  r2_bucket_name: string;
  checkpoint_bookmark: string;
  backup_r2_key: string;
  inventory_json: string;
  preflight_counts_json: string;
};

export async function verifyInPlaceCandidate(request: Request, env: WorkerEnv): Promise<Response> {
  requireOrchestrationSecret(request, env);
  if (
    env.HQBASE_INSTALL_MODE !== "community_upgrade" ||
    !env.HQBASE_INSTALLATION_ID ||
    !env.PRO_LICENSE_KEY ||
    !env.BETTER_AUTH_SECRET ||
    !env.PRO_JOBS
  ) {
    throw new AppError(
      "UPGRADE_CANDIDATE_CONFIGURATION_INVALID",
      "The Pro candidate configuration is incomplete.",
      409
    );
  }
  const upgrade = await currentUpgrade(env.DB, ["migration_complete", "candidate_verified"]);
  if (
    upgrade.installation_id !== env.HQBASE_INSTALLATION_ID ||
    upgrade.worker_name !== env.HQBASE_WORKER_NAME
  ) {
    throw new AppError(
      "UPGRADE_CANDIDATE_IDENTITY_MISMATCH",
      "The Pro candidate does not match the verified Community installation.",
      409
    );
  }
  const identity = await env.DB.prepare(
    "SELECT installation_id, worker_name FROM installation_identity WHERE singleton = 1"
  ).first<{ installation_id: string; worker_name: string }>();
  if (
    !identity ||
    identity.installation_id !== upgrade.installation_id ||
    identity.worker_name !== upgrade.worker_name
  ) {
    throw new AppError(
      "UPGRADE_INSTALLATION_IDENTITY_INVALID",
      "The durable installation identity failed validation.",
      409
    );
  }
  await verifySchema(env.DB);
  await verifyCounts(env.DB, upgrade.preflight_counts_json);
  await verifyStoredObjects(env, upgrade.backup_r2_key);
  const asset = await env.ASSETS.fetch(new Request("https://assets.invalid/index.html"));
  if (!asset.ok || (await asset.text()).length === 0) {
    throw new AppError("UPGRADE_ASSETS_INVALID", "The Pro static assets failed validation.", 409);
  }
  await env.DB.prepare(
    `INSERT OR IGNORE INTO pro_entitlement
     (singleton, installation_id, state, can_configure, created_at, updated_at)
     VALUES (1, ?, 'unlicensed', 1, datetime('now'), datetime('now'))`
  )
    .bind(upgrade.installation_id)
    .run();
  const entitlement = await activateWorkspace(env, {
    licenseKey: env.PRO_LICENSE_KEY,
    hostname: env.HQBASE_UPGRADE_WORKSPACE_HOSTNAME ?? new URL(upgrade.workspace_origin).hostname
  });
  if (entitlement.state === "unlicensed" || entitlement.state === "inactive") {
    throw new AppError("UPGRADE_ENTITLEMENT_INACTIVE", "The Pro entitlement is not active.", 403);
  }
  await env.DB.prepare(
    `INSERT INTO pro_upgrade_lifecycle
      (singleton, source_edition, state, checkpoint_bookmark, backup_r2_key,
       source_worker_name, target_worker_name, started_at, migrated_at, updated_at)
     VALUES (1, 'community', 'migrated', ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
     ON CONFLICT(singleton) DO UPDATE SET
       checkpoint_bookmark = excluded.checkpoint_bookmark,
       backup_r2_key = excluded.backup_r2_key,
       source_worker_name = excluded.source_worker_name,
       target_worker_name = excluded.target_worker_name,
       state = 'migrated', updated_at = datetime('now')`
  )
    .bind(
      upgrade.checkpoint_bookmark,
      upgrade.backup_r2_key,
      upgrade.worker_name,
      upgrade.worker_name
    )
    .run();
  return Response.json({ ok: true, version: env.HQBASE_APP_VERSION, edition: "pro" });
}

export async function completeInPlaceUpgrade(
  request: Request,
  env: WorkerEnv,
  fetcher: typeof fetch = fetch
): Promise<Response> {
  const upgrade = await currentUpgrade(env.DB, ["promoted", "complete"]);
  if (upgrade.workspace_origin !== new URL(request.url).origin) {
    throw new AppError("UPGRADE_ORIGIN_MISMATCH", "This upgrade belongs to another origin.", 403);
  }
  if (upgrade.state === "complete") return Response.json(completionStatus());
  const token = env.HQBASE_SETUP_OAUTH_ACCESS_TOKEN;
  if (!token) {
    throw new AppError(
      "UPGRADE_GRANT_MISSING",
      "Cloudflare authorization expired before final verification.",
      409
    );
  }
  await verifyPromotedService(upgrade, token, fetcher);
  const entitlement = await getEntitlementStatus(env.DB);
  if (entitlement.state === "unlicensed" || entitlement.state === "inactive") {
    throw new AppError("UPGRADE_ENTITLEMENT_INACTIVE", "The Pro entitlement is not active.", 409);
  }
  const upgradeColumns = await env.DB.prepare("PRAGMA table_info(community_pro_upgrades)").all<{
    name: string;
  }>();
  const hasContinuationCiphertext = upgradeColumns.results.some(
    (column) => column.name === "continuation_ciphertext"
  );
  await env.DB.batch([
    env.DB.prepare(completionUpgradeSql(hasContinuationCiphertext)).bind(upgrade.id),
    env.DB.prepare(
      `UPDATE pro_upgrade_lifecycle
       SET state = 'cutover_verified', deployed_at = COALESCE(deployed_at, datetime('now')),
           cutover_verified_at = datetime('now'), updated_at = datetime('now')
       WHERE singleton = 1`
    ),
    env.DB.prepare(
      `INSERT INTO community_pro_upgrade_audit
       (id, upgrade_id, transition, outcome, metadata_json, occurred_at)
       VALUES (?, ?, 'promoted->complete', 'success', '{}', datetime('now'))`
    ).bind(crypto.randomUUID(), upgrade.id)
  ]);
  try {
    await deleteTemporarySecrets(upgrade, token, fetcher);
  } finally {
    await revokeGrant(token, env.CLOUDFLARE_UPGRADE_OAUTH_CLIENT_ID, fetcher);
  }
  return Response.json(completionStatus(), {
    headers: {
      "set-cookie": "hqb_pro_upgrade=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    }
  });
}

export function completionUpgradeSql(hasContinuationCiphertext: boolean): string {
  return `UPDATE community_pro_upgrades
          SET state = 'complete', completed_at = datetime('now'), updated_at = datetime('now'),
              error_code = NULL, recovery_action = NULL${hasContinuationCiphertext ? ", continuation_ciphertext = NULL" : ""}
          WHERE id = ? AND state = 'promoted'`;
}

async function currentUpgrade(db: D1Database, states: string[]): Promise<UpgradeRow> {
  const placeholders = states.map(() => "?").join(", ");
  const row = await db
    .prepare(
      `SELECT id, installation_id, worker_name, workspace_origin, state, account_id,
              active_version_id, candidate_version_id, d1_database_id, r2_bucket_name,
              checkpoint_bookmark, backup_r2_key, inventory_json, preflight_counts_json
       FROM community_pro_upgrades WHERE state IN (${placeholders})
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(...states)
    .first<UpgradeRow>();
  if (!row) throw new AppError("UPGRADE_NOT_FOUND", "The in-place upgrade was not found.", 404);
  return row;
}

async function verifySchema(db: D1Database): Promise<void> {
  const rows = await db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
    .all<{ name: string }>();
  const tables = new Set(rows.results.map((row) => row.name));
  const required = [
    "pro_schema_state",
    "pro_entitlement",
    "pro_audit_events",
    "mail_domains",
    "mailbox_addresses",
    "workspace_hosts",
    "pro_upgrade_lifecycle"
  ];
  if (required.some((name) => !tables.has(name))) {
    throw new AppError("UPGRADE_SCHEMA_INCOMPLETE", "The Pro database schema is incomplete.", 409);
  }
  const release = await db
    .prepare("SELECT edition, installed_schema_version FROM pro_release_state WHERE singleton = 1")
    .first<{ edition: string; installed_schema_version: number }>();
  if (release?.edition !== "pro" || release.installed_schema_version !== 11) {
    throw new AppError("UPGRADE_SCHEMA_INCOMPLETE", "The Pro database schema is incomplete.", 409);
  }
}

async function verifyCounts(db: D1Database, encoded: string): Promise<void> {
  const expected = JSON.parse(encoded) as Record<string, number>;
  for (const table of ["user", "session", "mailboxes", "messages", "message_attachments"]) {
    const row = await db
      .prepare(`SELECT COUNT(*) AS count FROM "${table}"`)
      .first<{ count: number }>();
    if ((row?.count ?? 0) < (expected[table] ?? 0)) {
      throw new AppError(
        "UPGRADE_DATA_PRESERVATION_FAILED",
        "Workspace data validation failed.",
        409
      );
    }
  }
  const primaryDomain = await db
    .prepare("SELECT value_json FROM app_settings WHERE key = 'primary_domain'")
    .first<{ value_json: string }>();
  if (primaryDomain) {
    const domains = await db
      .prepare("SELECT COUNT(*) AS count FROM mail_domains")
      .first<{ count: number }>();
    if (!domains?.count) {
      throw new AppError(
        "UPGRADE_DOMAIN_PRESERVATION_FAILED",
        "Domain configuration validation failed.",
        409
      );
    }
  }
}

async function verifyStoredObjects(env: WorkerEnv, backupKey: string): Promise<void> {
  const backup = await env.MAIL_OBJECTS.head(backupKey);
  if (!backup || backup.size <= 0) {
    throw new AppError("UPGRADE_BACKUP_MISSING", "The pre-upgrade backup is missing.", 409);
  }
  const rows = await env.DB.prepare(
    `SELECT object_key FROM (
         SELECT html_r2_key AS object_key FROM messages WHERE html_r2_key IS NOT NULL
         UNION ALL SELECT raw_r2_key FROM messages WHERE raw_r2_key IS NOT NULL
         UNION ALL SELECT r2_key FROM message_attachments
       ) LIMIT 12`
  ).all<{ object_key: string }>();
  for (const row of rows.results) {
    if (!(await env.MAIL_OBJECTS.head(row.object_key))) {
      throw new AppError(
        "UPGRADE_ATTACHMENT_PRESERVATION_FAILED",
        "Mail object validation failed.",
        409
      );
    }
  }
}

function requireOrchestrationSecret(request: Request, env: WorkerEnv): void {
  const expected = env.PRO_UPGRADE_ORCHESTRATION_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !actual || !timingSafeEqual(expected, actual)) {
    throw new AppError(
      "UPGRADE_CANDIDATE_UNAUTHORIZED",
      "Candidate validation is unauthorized.",
      401
    );
  }
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function completionStatus() {
  return {
    state: "complete",
    message: "Your workspace is now running HQBase Pro.",
    preserved: "Your users, mail, domains, and Cloudflare resources were preserved."
  };
}
