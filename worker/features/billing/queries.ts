import type { EntitlementState, EntitlementStatus } from "./types";

type EntitlementRow = {
  installation_id: string;
  state: EntitlementState;
  can_configure: number;
  display_key: string | null;
  current_period_end: string | null;
  checked_at: string | null;
  grace_ends_at: string | null;
  last_error: string | null;
  activation_id: string | null;
  encrypted_license_key: string | null;
};

export async function ensureEntitlement(db: D1Database): Promise<EntitlementRow> {
  const current = await getEntitlementRow(db);
  if (current) return current;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO pro_entitlement
       (singleton, installation_id, state, can_configure, created_at, updated_at)
       VALUES (1, ?, 'unlicensed', 1, ?, ?)`
    )
    .bind(crypto.randomUUID(), now, now)
    .run();
  const created = await getEntitlementRow(db);
  if (!created) throw new Error("Could not initialize workspace entitlement.");
  return created;
}

export async function getEntitlementStatus(db: D1Database): Promise<EntitlementStatus> {
  return publicStatus(await ensureEntitlement(db));
}

export async function getEntitlementRow(db: D1Database): Promise<EntitlementRow | null> {
  return db
    .prepare(
      `SELECT installation_id, state, can_configure, display_key, current_period_end,
              checked_at, grace_ends_at, last_error, activation_id, encrypted_license_key
       FROM pro_entitlement WHERE singleton = 1`
    )
    .first<EntitlementRow>();
}

export async function saveEntitlement(
  db: D1Database,
  input: {
    activationId: string;
    displayKey: string;
    encryptedLicenseKey?: string;
    state: EntitlementState;
    canConfigure: boolean;
    currentPeriodEnd: string | null;
    checkedAt: string;
    graceEndsAt: string | null;
    lastError: string | null;
  }
): Promise<EntitlementStatus> {
  const current = await ensureEntitlement(db);
  await db
    .prepare(
      `UPDATE pro_entitlement SET activation_id = ?, display_key = ?,
       encrypted_license_key = COALESCE(?, encrypted_license_key), state = ?, can_configure = ?,
       current_period_end = ?, checked_at = ?, next_check_at = ?, grace_ends_at = ?,
       last_error = ?, updated_at = ? WHERE singleton = 1`
    )
    .bind(
      input.activationId,
      input.displayKey,
      input.encryptedLicenseKey ?? null,
      input.state,
      input.canConfigure ? 1 : 0,
      input.currentPeriodEnd,
      input.checkedAt,
      new Date(new Date(input.checkedAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      input.graceEndsAt,
      input.lastError,
      input.checkedAt
    )
    .run();
  return {
    ...publicStatus(current),
    state: input.state,
    canConfigure: input.canConfigure,
    displayKey: input.displayKey,
    currentPeriodEnd: input.currentPeriodEnd,
    checkedAt: input.checkedAt,
    graceEndsAt: input.graceEndsAt,
    lastError: input.lastError
  };
}

export async function recordEntitlementError(db: D1Database, code: string): Promise<void> {
  await ensureEntitlement(db);
  await db
    .prepare("UPDATE pro_entitlement SET last_error = ?, updated_at = ? WHERE singleton = 1")
    .bind(code, new Date().toISOString())
    .run();
}

function publicStatus(row: EntitlementRow): EntitlementStatus {
  return {
    installationId: row.installation_id,
    state: row.state,
    canConfigure: row.can_configure === 1,
    displayKey: row.display_key,
    currentPeriodEnd: row.current_period_end,
    checkedAt: row.checked_at,
    graceEndsAt: row.grace_ends_at,
    lastError: row.last_error
  };
}
