import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { cloudflare } from "./cloudflare";
import { transitionUpgrade } from "./queries";
import type { ProWorkerBundle } from "./release";
import { readPreparedResources, recordPreparedSecretOwnership } from "./resources";
import type { UpgradeInventory, UpgradeRecord } from "./types";

const apiBase = "https://api.cloudflare.com/client/v4";
export const proUpgradeSecretNames = [
  "PRO_APP_PASSWORD_PEPPER",
  "PRO_BRIDGE_TOKEN",
  "PRO_SESSION_SECRET",
  "PRO_ENTITLEMENT_SECRET",
  "PRO_LICENSE_KEY",
  "PRO_UPGRADE_ORCHESTRATION_SECRET",
  "HQBASE_SETUP_OAUTH_ACCESS_TOKEN"
] as const;

export async function uploadProCandidate(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  token: string,
  licenseKey: string,
  orchestrationSecret: string,
  bundle: ProWorkerBundle,
  fetcher: typeof fetch = fetch
): Promise<UpgradeRecord> {
  const inventory = await readInventory(env.DB, upgrade.id);
  let resources = await readPreparedResources(env.DB, upgrade.id);
  resources = await recordPreparedSecretOwnership(
    env.DB,
    upgrade.id,
    resources,
    inventory.secretNames,
    proUpgradeSecretNames
  );
  await provisionSecrets(
    token,
    inventory,
    {
      PRO_APP_PASSWORD_PEPPER: randomSecret(),
      PRO_BRIDGE_TOKEN: randomSecret(),
      PRO_SESSION_SECRET: randomSecret(),
      PRO_ENTITLEMENT_SECRET: randomSecret(),
      PRO_LICENSE_KEY: licenseKey,
      PRO_UPGRADE_ORCHESTRATION_SECRET: orchestrationSecret,
      HQBASE_SETUP_OAUTH_ACCESS_TOKEN: token
    },
    fetcher
  );
  const assetsJwt = await uploadAssets(token, inventory, bundle, fetcher);
  const alias = `u${upgrade.id.replaceAll("-", "").slice(0, 8)}`;
  const excluded = new Set([
    "ASSETS",
    "PRO_JOBS",
    "HQBASE_APP_VERSION",
    "HQBASE_INSTALLATION_ID",
    "HQBASE_INSTALL_MODE",
    "HQBASE_WORKER_NAME",
    "HQBASE_COMMUNITY_WORKER_NAME",
    "HQBASE_UPGRADE_WORKSPACE_HOSTNAME",
    "CLOUDFLARE_UPGRADE_OAUTH_CLIENT_ID"
  ]);
  const bindings: Array<Record<string, unknown>> = inventory.bindings
    .filter((binding) => !excluded.has(binding.name))
    .map((binding) => ({ name: binding.name, type: "inherit", version_id: "latest" }));
  for (const name of proUpgradeSecretNames) {
    if (!bindings.some((binding) => binding.name === name)) {
      bindings.push({ name, type: "inherit", version_id: "latest" });
    }
  }
  bindings.push(
    { name: "ASSETS", type: "assets" },
    { name: "PRO_JOBS", type: "queue", queue_name: resources.jobsQueue },
    { name: "HQBASE_APP_VERSION", type: "plain_text", text: bundle.version },
    { name: "HQBASE_INSTALLATION_ID", type: "plain_text", text: upgrade.installationId },
    { name: "HQBASE_INSTALL_MODE", type: "plain_text", text: "community_upgrade" },
    { name: "HQBASE_WORKER_NAME", type: "plain_text", text: upgrade.workerName },
    { name: "HQBASE_COMMUNITY_WORKER_NAME", type: "plain_text", text: upgrade.workerName },
    {
      name: "HQBASE_UPGRADE_WORKSPACE_HOSTNAME",
      type: "plain_text",
      text: new URL(upgrade.workspaceOrigin).hostname
    },
    {
      name: "CLOUDFLARE_UPGRADE_OAUTH_CLIENT_ID",
      type: "plain_text",
      text: env.HQBASE_UPGRADE_CLOUDFLARE_OAUTH_CLIENT_ID ?? ""
    }
  );
  const metadata = {
    main_module: bundle.main.name,
    compatibility_date: bundle.compatibilityDate,
    compatibility_flags: bundle.compatibilityFlags,
    bindings,
    assets: {
      jwt: assetsJwt,
      config: {
        not_found_handling: "single-page-application",
        run_worker_first: ["/api/*"]
      }
    },
    annotations: {
      "workers/alias": alias,
      "workers/message": `HQBase Pro ${bundle.version} in-place upgrade candidate`,
      "workers/tag": `hqbase-upgrade-${upgrade.installationId}`
    }
  };
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  form.set(
    bundle.main.name,
    new Blob([arrayBuffer(fromBase64(bundle.main.contentBase64))], {
      type: "application/javascript+module"
    }),
    bundle.main.name
  );
  const candidate = await cloudflare<{ id?: string }>(
    token,
    `/accounts/${inventory.accountId}/workers/scripts/${inventory.workerName}/versions?bindings_inherit=strict`,
    { method: "POST", body: form },
    fetcher
  );
  if (!candidate.id) {
    throw new AppError(
      "UPGRADE_CANDIDATE_UPLOAD_FAILED",
      "Cloudflare did not create a Pro candidate.",
      502
    );
  }
  resources = {
    ...resources,
    candidateRelease: {
      version: bundle.version,
      mainSha256: bundle.main.sha256
    }
  };
  return transitionUpgrade(env.DB, upgrade.id, "resources_prepared", "candidate_uploaded", {
    candidate_version_id: candidate.id,
    preview_alias: alias,
    created_resources_json: JSON.stringify(resources),
    error_code: null,
    recovery_action: null
  });
}

export async function promoteCandidate(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<UpgradeRecord> {
  if (!upgrade.accountId || !upgrade.candidateVersionId) {
    throw new AppError("UPGRADE_CANDIDATE_MISSING", "The verified Pro candidate is missing.", 409);
  }
  const resources = await readPreparedResources(env.DB, upgrade.id);
  const jobs = resources.resources.find((resource) => resource.name === resources.jobsQueue);
  if (!jobs) throw new AppError("UPGRADE_QUEUE_MISSING", "The Pro jobs queue is missing.", 409);
  const queue = await cloudflare<{ consumers?: Array<{ script_name?: string }> }>(
    token,
    `/accounts/${upgrade.accountId}/queues/${jobs.id}`,
    {},
    fetcher
  );
  if (!(queue.consumers ?? []).some((consumer) => consumer.script_name === upgrade.workerName)) {
    await cloudflare(
      token,
      `/accounts/${upgrade.accountId}/queues/${jobs.id}/consumers`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "worker",
          script_name: upgrade.workerName,
          dead_letter_queue: resources.deadLetterQueue,
          settings: { batch_size: 10, max_wait_time_ms: 5000, max_retries: 3 }
        })
      },
      fetcher
    );
  }
  await cloudflare(
    token,
    `/accounts/${upgrade.accountId}/workers/scripts/${upgrade.workerName}/deployments`,
    {
      method: "POST",
      body: JSON.stringify({
        strategy: "percentage",
        versions: [{ version_id: upgrade.candidateVersionId, percentage: 100 }],
        annotations: { "workers/message": "Promote verified HQBase Pro in-place upgrade" }
      })
    },
    fetcher
  );
  return transitionUpgrade(env.DB, upgrade.id, "candidate_verified", "promoted", {
    error_code: null,
    recovery_action: null
  });
}

export async function previewUrl(db: D1Database, upgrade: UpgradeRecord): Promise<string> {
  const inventory = await readInventory(db, upgrade.id);
  if (!upgrade.candidateVersionId) {
    throw new AppError(
      "UPGRADE_PREVIEW_UNAVAILABLE",
      "Cloudflare Preview URLs must be enabled before the candidate can be verified.",
      409
    );
  }
  return `https://${upgrade.candidateVersionId.slice(0, 8)}-${upgrade.workerName}.${inventory.accountSubdomain}.workers.dev`;
}

async function provisionSecrets(
  token: string,
  inventory: UpgradeInventory,
  values: Record<(typeof proUpgradeSecretNames)[number], string>,
  fetcher: typeof fetch
): Promise<void> {
  const existing = new Set(inventory.secretNames);
  for (const name of proUpgradeSecretNames) {
    if (existing.has(name)) continue;
    await cloudflare(
      token,
      `/accounts/${inventory.accountId}/workers/scripts/${inventory.workerName}/secrets`,
      {
        method: "PUT",
        body: JSON.stringify({ name, text: values[name], type: "secret_text" })
      },
      fetcher
    );
  }
}

async function uploadAssets(
  token: string,
  inventory: UpgradeInventory,
  bundle: ProWorkerBundle,
  fetcher: typeof fetch
): Promise<string> {
  const manifest = Object.fromEntries(
    bundle.assets.map((asset) => [asset.path, { hash: asset.hash, size: asset.size }])
  );
  const session = await cloudflare<{ jwt?: string; buckets?: string[][] }>(
    token,
    `/accounts/${inventory.accountId}/workers/scripts/${inventory.workerName}/assets-upload-session`,
    { method: "POST", body: JSON.stringify({ manifest }) },
    fetcher
  );
  if (!session.jwt)
    throw new AppError("UPGRADE_ASSET_SESSION_FAILED", "Static assets could not be prepared.", 502);
  let completion = session.jwt;
  const byHash = new Map(bundle.assets.map((asset) => [asset.hash, asset]));
  for (const bucket of session.buckets ?? []) {
    const form = new FormData();
    for (const hash of bucket) {
      const asset = byHash.get(hash);
      if (!asset) throw new Error("Cloudflare requested an unknown signed asset.");
      form.set(
        hash,
        new Blob([asset.contentBase64], { type: asset.contentType || "application/null" }),
        hash
      );
    }
    const response = await fetcher(
      `${apiBase}/accounts/${inventory.accountId}/workers/assets/upload?base64=true`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${session.jwt}` },
        body: form
      }
    );
    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      result?: { jwt?: string };
    } | null;
    if (!response.ok || !payload?.success) {
      throw new AppError(
        "UPGRADE_ASSET_UPLOAD_FAILED",
        "Static assets could not be uploaded.",
        502
      );
    }
    completion = payload.result?.jwt ?? completion;
  }
  return completion;
}

export async function readInventory(db: D1Database, upgradeId: string): Promise<UpgradeInventory> {
  const row = await db
    .prepare("SELECT inventory_json FROM community_pro_upgrades WHERE id = ?")
    .bind(upgradeId)
    .first<{ inventory_json: string | null }>();
  const inventory = JSON.parse(row?.inventory_json ?? "null") as UpgradeInventory | null;
  if (!inventory?.accountId || !inventory.accountSubdomain || !Array.isArray(inventory.bindings)) {
    throw new AppError(
      "UPGRADE_INVENTORY_MISSING",
      "The Community resource inventory is missing.",
      409
    );
  }
  return inventory;
}

function randomSecret(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function base64Url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
