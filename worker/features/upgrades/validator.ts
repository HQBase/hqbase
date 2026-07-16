import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { cloudflare } from "./cloudflare";
import { readInventory } from "./deployment";
import { readPreparedResources } from "./resources";
import type { UpgradeRecord } from "./types";

const apiBase = "https://api.cloudflare.com/client/v4";

export async function ensureCandidateValidator(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<string> {
  if (!upgrade.accountId || !upgrade.candidateVersionId) {
    throw new AppError("UPGRADE_CANDIDATE_MISSING", "The Pro candidate is missing.", 409);
  }
  const inventory = await readInventory(env.DB, upgrade.id);
  let prepared = await readPreparedResources(env.DB, upgrade.id);
  const name = validatorName(upgrade.installationId);
  const recorded = prepared.resources.find(
    (resource) => resource.type === "worker" && resource.name === name
  );
  if (!recorded) {
    const scripts = await cloudflare<Array<{ id?: string }>>(
      token,
      `/accounts/${upgrade.accountId}/workers/scripts`,
      {},
      fetcher
    );
    if (scripts.some((script) => script.id === name)) {
      throw new AppError(
        "UPGRADE_VALIDATOR_NAME_COLLISION",
        "A disposable validator name is already in use in the authorized account.",
        409
      );
    }
    prepared = {
      ...prepared,
      resources: [
        ...prepared.resources,
        {
          type: "worker",
          name,
          id: name,
          ownership: "created",
          disposition: "disposable"
        }
      ]
    };
    const result = await env.DB.prepare(
      `UPDATE community_pro_upgrades
       SET created_resources_json = ?, updated_at = datetime('now')
       WHERE id = ? AND state IN ('candidate_uploaded', 'migration_started', 'migration_complete')`
    )
      .bind(JSON.stringify(prepared), upgrade.id)
      .run();
    if ((result.meta.changes ?? 0) !== 1) throw new Error("Upgrade state changed concurrently.");
  }

  const source = validatorModule(upgrade);
  const form = new FormData();
  form.set(
    "metadata",
    JSON.stringify({
      main_module: "validator.mjs",
      compatibility_date: "2026-07-11",
      bindings: [{ name: "TARGET", type: "service", service: upgrade.workerName }],
      annotations: {
        "workers/message": "Temporary HQBase Pro candidate validator",
        "workers/tag": `hqbase-upgrade-validator-${upgrade.installationId}`
      }
    })
  );
  form.set(
    "validator.mjs",
    new Blob([source], { type: "application/javascript+module" }),
    "validator.mjs"
  );
  await cloudflare(
    token,
    `/accounts/${upgrade.accountId}/workers/scripts/${name}`,
    { method: "PUT", body: form },
    fetcher
  );
  const subdomain = await cloudflare<{ enabled?: boolean }>(
    token,
    `/accounts/${upgrade.accountId}/workers/scripts/${name}/subdomain`,
    {
      method: "POST",
      body: JSON.stringify({ enabled: true, previews_enabled: false })
    },
    fetcher
  );
  if (!subdomain.enabled) {
    throw new AppError(
      "UPGRADE_VALIDATOR_ROUTE_FAILED",
      "Cloudflare could not route the disposable candidate validator.",
      502
    );
  }
  return `https://${name}.${inventory.accountSubdomain}.workers.dev/validate`;
}

export async function deleteCandidateValidators(
  env: WorkerEnv,
  upgrade: UpgradeRecord,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  if (!upgrade.accountId) return;
  const row = await env.DB.prepare(
    "SELECT created_resources_json FROM community_pro_upgrades WHERE id = ?"
  )
    .bind(upgrade.id)
    .first<{ created_resources_json: string | null }>();
  if (!row?.created_resources_json) return;
  const parsed = JSON.parse(row.created_resources_json) as unknown;
  if (Array.isArray(parsed) && parsed.length === 0) return;
  const prepared = parsed as {
    resources?: unknown;
  };
  if (!Array.isArray(prepared.resources)) {
    throw new Error("The Pro resource inventory is malformed.");
  }
  for (const resource of prepared.resources as Array<{
    type?: string;
    name?: string;
    ownership?: string;
    disposition?: string;
  }>) {
    if (
      resource.type !== "worker" ||
      resource.ownership !== "created" ||
      resource.disposition !== "disposable"
    ) {
      continue;
    }
    if (!resource.name) throw new Error("A disposable validator name is missing.");
    const response = await fetcher(
      `${apiBase}/accounts/${upgrade.accountId}/workers/scripts/${encodeURIComponent(resource.name)}`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}` } }
    );
    if (!response.ok && response.status !== 404) {
      throw new Error("Cloudflare disposable validator cleanup failed.");
    }
  }
}

export function validatorName(installationId: string): string {
  return `hqbase-upgrade-validator-${installationId.replaceAll("-", "").slice(0, 12)}`;
}

function validatorModule(upgrade: UpgradeRecord): string {
  const target = `${upgrade.workspaceOrigin}/api/upgrades/pro/candidate/verify`;
  const override = `${upgrade.workerName}="${upgrade.candidateVersionId}"`;
  return `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/validate") {
      return new Response("Not found", { status: 404 });
    }
    const authorization = request.headers.get("authorization") || "";
    return env.TARGET.fetch(${JSON.stringify(target)}, {
      method: "POST",
      headers: {
        authorization,
        "cache-control": "no-store",
        "cloudflare-workers-version-overrides": ${JSON.stringify(override)}
      }
    });
  }
};`;
}
