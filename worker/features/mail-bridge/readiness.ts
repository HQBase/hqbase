import type { WorkerEnv } from "../../lib/env";

const requiredTables = [
  "pro_entitlements",
  "pro_schema_state",
  "pro_app_passwords",
  "pro_mail_sessions",
  "pro_imap_mailboxes"
] as const;

export type BridgeReadiness = {
  ready: boolean;
  checks: {
    database: boolean;
    schema: boolean;
    entitlement: boolean;
    storage: boolean;
  };
};

export async function inspectBridgeReadiness(env: WorkerEnv): Promise<BridgeReadiness> {
  const checks: BridgeReadiness["checks"] = {
    database: false,
    schema: false,
    entitlement: false,
    storage: false
  };

  try {
    const [tables, schema, entitlement] = await Promise.all([
      env.DB.prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name IN (${requiredTables.map(() => "?").join(", ")})`
      )
        .bind(...requiredTables)
        .all<{ name: string }>(),
      env.DB.prepare("SELECT value FROM pro_schema_state WHERE key = 'track1_operations'").first<{
        value: string;
      }>(),
      env.DB.prepare("SELECT enabled FROM pro_entitlements WHERE key = 'mail_bridge'").first<{
        enabled: number;
      }>()
    ]);

    checks.database = requiredTables.every((name) =>
      tables.results.some((table) => table.name === name)
    );
    checks.schema = schema?.value === "0004";
    checks.entitlement = entitlement?.enabled === 1;
  } catch {
    return { ready: false, checks };
  }

  // A missing sentinel is healthy. The head call itself proves the binding and bucket are usable
  // without mutating or reading mail content.
  try {
    await env.MAIL_OBJECTS.head("__hqbase_readiness__");
    checks.storage = true;
  } catch {
    checks.storage = false;
  }

  return { ready: Object.values(checks).every(Boolean), checks };
}
