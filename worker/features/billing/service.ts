import { z } from "zod";
import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { decryptLicenseKey, encryptLicenseKey } from "./crypto";
import {
  ensureEntitlement,
  getEntitlementRow,
  getEntitlementStatus,
  recordEntitlementError,
  saveEntitlement
} from "./queries";
import type { EntitlementState, EntitlementStatus } from "./types";

const responseSchema = z.object({
  state: z.enum(["active", "canceling", "past_due", "inactive"]),
  canConfigure: z.boolean(),
  activationId: z.string().uuid(),
  displayKey: z.string().min(1).max(200),
  currentPeriodEnd: z.string().datetime().nullable(),
  checkedAt: z.string().datetime()
});

const billingUrl = "https://billing.hqbase.io";
const graceMilliseconds = 7 * 24 * 60 * 60 * 1000;

export async function activateWorkspace(
  env: WorkerEnv,
  input: { licenseKey: string; hostname: string },
  fetcher: typeof fetch = fetch
): Promise<EntitlementStatus> {
  const entitlement = await ensureEntitlement(env.DB);
  const normalizedKey = input.licenseKey.trim().toUpperCase();
  const remote = await callBilling(
    env,
    "/v1/entitlements/activate",
    {
      licenseKey: normalizedKey,
      installationId: entitlement.installation_id,
      hostname: input.hostname,
      appVersion: env.HQBASE_APP_VERSION ?? "0.1.1"
    },
    fetcher
  );
  if (remote.state === "inactive") {
    throw new AppError("LICENSE_INACTIVE", "This HQBase Pro license is not active.", 403);
  }
  return saveEntitlement(env.DB, {
    activationId: remote.activationId,
    displayKey: remote.displayKey,
    encryptedLicenseKey: await encryptLicenseKey(env.PRO_ENTITLEMENT_SECRET, normalizedKey),
    state: remote.state,
    canConfigure: remote.canConfigure,
    currentPeriodEnd: remote.currentPeriodEnd,
    checkedAt: remote.checkedAt,
    graceEndsAt: null,
    lastError: null
  });
}

export async function refreshWorkspaceEntitlement(
  env: WorkerEnv,
  fetcher: typeof fetch = fetch
): Promise<EntitlementStatus> {
  const row = await getEntitlementRow(env.DB);
  if (!row?.encrypted_license_key || !row.activation_id) {
    return getEntitlementStatus(env.DB);
  }
  try {
    const remote = await callBilling(
      env,
      "/v1/entitlements/refresh",
      {
        licenseKey: await decryptLicenseKey(env.PRO_ENTITLEMENT_SECRET, row.encrypted_license_key),
        installationId: row.installation_id
      },
      fetcher
    );
    const local = localState(remote.state, row.state, row.grace_ends_at, remote.checkedAt);
    return saveEntitlement(env.DB, {
      activationId: remote.activationId,
      displayKey: remote.displayKey,
      state: local.state,
      canConfigure: local.canConfigure,
      currentPeriodEnd: remote.currentPeriodEnd,
      checkedAt: remote.checkedAt,
      graceEndsAt: local.graceEndsAt,
      lastError: null
    });
  } catch (error) {
    await recordEntitlementError(env.DB, "refresh_failed");
    if (error instanceof AppError && error.status < 500) throw error;
    return getEntitlementStatus(env.DB);
  }
}

export function localState(
  remote: "active" | "canceling" | "past_due" | "inactive",
  previous: EntitlementState,
  previousGraceEnd: string | null,
  checkedAt: string
): { state: EntitlementState; canConfigure: boolean; graceEndsAt: string | null } {
  if (remote !== "inactive") {
    return { state: remote, canConfigure: true, graceEndsAt: null };
  }
  const now = new Date(checkedAt).getTime();
  const graceEndsAt =
    previous === "grace" && previousGraceEnd
      ? previousGraceEnd
      : new Date(now + graceMilliseconds).toISOString();
  if (new Date(graceEndsAt).getTime() > now) {
    return { state: "grace", canConfigure: true, graceEndsAt };
  }
  return { state: "inactive", canConfigure: false, graceEndsAt };
}

async function callBilling(
  env: WorkerEnv,
  path: string,
  body: unknown,
  fetcher: typeof fetch
): Promise<z.infer<typeof responseSchema>> {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
  const response = env.BILLING
    ? await env.BILLING.fetch(new Request(`https://billing.internal${path}`, init))
    : await fetcher(`${env.HQBASE_BILLING_URL ?? billingUrl}${path}`, init);
  if (!response.ok) {
    const invalid = response.status === 400 || response.status === 403 || response.status === 404;
    throw new AppError(
      invalid ? "LICENSE_INVALID" : "BILLING_UNAVAILABLE",
      invalid ? "The license key could not be activated." : "Billing verification is unavailable.",
      invalid ? 403 : 503
    );
  }
  return responseSchema.parse(await response.json());
}
