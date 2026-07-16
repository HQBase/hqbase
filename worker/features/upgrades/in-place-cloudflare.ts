import { AppError } from "../../lib/errors";

export type PromotionUpgrade = {
  account_id: string;
  worker_name: string;
  active_version_id: string;
  candidate_version_id: string;
  d1_database_id: string;
  r2_bucket_name: string;
  inventory_json: string;
  created_resources_json: string;
};

export async function verifyPromotedService(
  upgrade: PromotionUpgrade,
  token: string,
  fetcher: typeof fetch
): Promise<void> {
  const deployment = await cf<{
    deployments?: Array<{ versions?: Array<{ version_id?: string; percentage?: number }> }>;
  }>(
    token,
    `/accounts/${upgrade.account_id}/workers/scripts/${upgrade.worker_name}/deployments`,
    fetcher
  );
  const activeVersions = deployment.deployments?.[0]?.versions ?? [];
  if (
    !activeVersions.some(
      (version) => version.version_id === upgrade.candidate_version_id && version.percentage === 100
    )
  ) {
    throw new AppError(
      "UPGRADE_PROMOTION_UNVERIFIED",
      "The Pro version is not serving all traffic.",
      409
    );
  }

  const settings = await cf<{
    bindings?: Array<Record<string, unknown> & { name?: string; type?: string }>;
  }>(
    token,
    `/accounts/${upgrade.account_id}/workers/scripts/${upgrade.worker_name}/settings`,
    fetcher
  );
  const d1 = settings.bindings?.find((binding) => binding.name === "DB" && binding.type === "d1");
  const r2 = settings.bindings?.find(
    (binding) => binding.name === "MAIL_OBJECTS" && binding.type === "r2_bucket"
  );
  if (
    d1?.database_id !== upgrade.d1_database_id ||
    r2?.bucket_name !== upgrade.r2_bucket_name ||
    !settings.bindings?.some((binding) => binding.name === "BETTER_AUTH_SECRET")
  ) {
    throw new AppError(
      "UPGRADE_RESOURCE_PRESERVATION_FAILED",
      "Cloudflare resource validation failed.",
      409
    );
  }

  const inventory = JSON.parse(upgrade.inventory_json) as {
    secretNames?: string[];
    customDomains?: string[];
    routes?: Array<{ pattern: string }>;
  };
  const [secrets, domains, serviceVersions, zones] = await Promise.all([
    cf<Array<{ name?: string }>>(
      token,
      `/accounts/${upgrade.account_id}/workers/scripts/${upgrade.worker_name}/secrets`,
      fetcher
    ),
    cf<Array<{ hostname?: string; service?: string }>>(
      token,
      `/accounts/${upgrade.account_id}/workers/domains`,
      fetcher
    ),
    cf<Array<{ id?: string }>>(
      token,
      `/accounts/${upgrade.account_id}/workers/scripts/${upgrade.worker_name}/versions`,
      fetcher
    ),
    cf<Array<{ id?: string }>>(
      token,
      `/zones?account.id=${encodeURIComponent(upgrade.account_id)}&per_page=100`,
      fetcher
    )
  ]);
  const secretNames = new Set(secrets.flatMap((secret) => (secret.name ? [secret.name] : [])));
  if ((inventory.secretNames ?? []).some((name) => !secretNames.has(name))) {
    throw new AppError(
      "UPGRADE_SECRET_PRESERVATION_FAILED",
      "An existing Worker secret binding is missing after promotion.",
      409
    );
  }
  if (!serviceVersions.some((version) => version.id === upgrade.active_version_id)) {
    throw new AppError(
      "UPGRADE_ROLLBACK_VERSION_MISSING",
      "The previous Community Worker version is not available for recovery.",
      409
    );
  }

  const currentDomains = domains
    .filter((domain) => domain.service === upgrade.worker_name && domain.hostname)
    .map((domain) => String(domain.hostname))
    .sort();
  if (
    JSON.stringify(currentDomains) !== JSON.stringify([...(inventory.customDomains ?? [])].sort())
  ) {
    throw new AppError(
      "UPGRADE_DOMAIN_PRESERVATION_FAILED",
      "Worker custom domains changed during promotion.",
      409
    );
  }

  const currentRoutes: string[] = [];
  for (const zone of zones) {
    if (!zone.id) continue;
    const routes = await cf<Array<{ pattern?: string; script?: string }>>(
      token,
      `/zones/${zone.id}/workers/routes`,
      fetcher
    );
    for (const route of routes) {
      if (route.script === upgrade.worker_name && route.pattern) currentRoutes.push(route.pattern);
    }
  }
  const expectedRoutes = (inventory.routes ?? []).map((route) => route.pattern).sort();
  if (JSON.stringify(currentRoutes.sort()) !== JSON.stringify(expectedRoutes)) {
    throw new AppError(
      "UPGRADE_ROUTE_PRESERVATION_FAILED",
      "Worker routes changed during promotion.",
      409
    );
  }
}

export async function deleteTemporarySecrets(
  upgrade: PromotionUpgrade,
  token: string,
  fetcher: typeof fetch
): Promise<void> {
  for (const name of ["HQBASE_SETUP_OAUTH_ACCESS_TOKEN", "PRO_UPGRADE_ORCHESTRATION_SECRET"]) {
    await cf(
      token,
      `/accounts/${upgrade.account_id}/workers/scripts/${upgrade.worker_name}/secrets/${name}`,
      fetcher,
      { method: "DELETE" }
    );
  }
}

export async function deleteDisposableWorkers(
  upgrade: PromotionUpgrade,
  token: string,
  fetcher: typeof fetch
): Promise<void> {
  const prepared = JSON.parse(upgrade.created_resources_json) as {
    resources?: Array<{
      type?: string;
      name?: string;
      ownership?: string;
      disposition?: string;
    }>;
  };
  const workers = (prepared.resources ?? []).filter(
    (resource) =>
      resource.type === "worker" &&
      resource.ownership === "created" &&
      resource.disposition === "disposable" &&
      resource.name &&
      resource.name !== upgrade.worker_name
  );
  for (const worker of workers) {
    const response = await fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${upgrade.account_id}/workers/scripts/${encodeURIComponent(String(worker.name))}`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}` } }
    );
    if (response.status === 404) continue;
    const body = (await response.json().catch(() => null)) as { success?: boolean } | null;
    if (!response.ok || !body?.success) {
      throw new Error("Cloudflare disposable validator cleanup failed.");
    }
  }
}

export async function revokeGrant(
  token: string,
  clientId: string | undefined,
  fetcher: typeof fetch
): Promise<void> {
  if (!clientId) return;
  const response = await fetcher("https://dash.cloudflare.com/oauth2/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, token })
  });
  if (!response.ok) throw new Error("Cloudflare grant revocation failed.");
}

async function cf<T = unknown>(
  token: string,
  path: string,
  fetcher: typeof fetch,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetcher(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) }
  });
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: T;
  } | null;
  if (!response.ok || !body?.success) throw new Error("Cloudflare final verification failed.");
  return body.result as T;
}
