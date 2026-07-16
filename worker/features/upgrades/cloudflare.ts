import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { verifySignedCommunityRelease } from "./community-release";
import type { UpgradeInventory } from "./types";

const apiBase = "https://api.cloudflare.com/client/v4";

type Envelope<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
};

export async function cloudflare<T>(
  token: string,
  path: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetcher(`${apiBase}${path}`, { ...init, headers });
  const payload = (await safeJson(response)) as Envelope<T> | null;
  if (!response.ok || !payload?.success) {
    console.warn("community_pro_upgrade_cloudflare_api_error", {
      apiCode: payload?.errors?.[0]?.code ?? null,
      operation: cloudflareOperation(path),
      status: response.status
    });
    throw new AppError(
      "CLOUDFLARE_UPGRADE_API_ERROR",
      publicCloudflareError(path, payload?.errors?.[0]?.code),
      response.status >= 400 && response.status < 500 ? response.status : 502
    );
  }
  return payload.result;
}

function cloudflareOperation(path: string): string {
  if (/^\/accounts(?:\?|$)/u.test(path)) return "list_accounts";
  if (/\/workers\/scripts\/?(?:\?|$)/u.test(path)) return "list_workers";
  if (path.endsWith("/settings")) return "read_worker_settings";
  if (path.endsWith("/deployments")) return "read_worker_deployments";
  if (path.endsWith("/secrets")) return "list_worker_secrets";
  if (path.endsWith("/workers/domains")) return "list_worker_domains";
  if (path.endsWith("/subdomain")) return "read_worker_subdomain";
  if (path.includes("/d1/database")) return "list_d1_databases";
  if (/^\/zones(?:\?|$)/u.test(path)) return "list_zones";
  if (path.endsWith("/workers/routes")) return "list_worker_routes";
  return "upgrade_cloudflare_api";
}

export async function discoverCommunityInstallation(
  env: WorkerEnv,
  token: string,
  expected: { installationId: string; workerName: string; workspaceOrigin: string },
  fetcher: typeof fetch = fetch
): Promise<{ inventory: UpgradeInventory; legacyRecovery: boolean }> {
  const accounts = await cloudflare<Array<{ id: string }>>(
    token,
    "/accounts?per_page=100",
    {},
    fetcher
  );
  const matches: Array<{ accountId: string; script: { id: string } }> = [];
  for (const account of accounts) {
    const scripts = await cloudflare<Array<{ id: string }>>(
      token,
      `/accounts/${account.id}/workers/scripts`,
      {},
      fetcher
    );
    for (const script of scripts) {
      if (script.id === expected.workerName) matches.push({ accountId: account.id, script });
    }
  }
  if (matches.length === 0) {
    throw new AppError(
      "UPGRADE_WORKER_NOT_FOUND",
      "The authorized accounts do not contain the expected Community Worker.",
      404
    );
  }
  if (matches.length !== 1) {
    throw new AppError(
      "UPGRADE_WORKER_AMBIGUOUS",
      "More than one authorized account contains the expected Worker name. Authorize only the target account.",
      409
    );
  }
  const match = matches[0];
  if (!match) throw new Error("Verified Worker match disappeared.");
  const { accountId } = match;
  const [settings, deployments, secrets, domains, subdomain, accountSubdomain, databases] =
    await Promise.all([
      cloudflare<{
        bindings?: Array<Record<string, unknown> & { name?: string; type?: string }>;
        compatibility_date?: string;
        compatibility_flags?: string[];
        assets?: Record<string, unknown>;
      }>(
        token,
        `/accounts/${accountId}/workers/scripts/${expected.workerName}/settings`,
        {},
        fetcher
      ),
      cloudflare<{
        deployments?: Array<{ versions?: Array<{ version_id?: string; percentage?: number }> }>;
      }>(
        token,
        `/accounts/${accountId}/workers/scripts/${expected.workerName}/deployments`,
        {},
        fetcher
      ),
      cloudflare<Array<{ name?: string }>>(
        token,
        `/accounts/${accountId}/workers/scripts/${expected.workerName}/secrets`,
        {},
        fetcher
      ),
      cloudflare<Array<{ hostname?: string; service?: string }>>(
        token,
        `/accounts/${accountId}/workers/domains`,
        {},
        fetcher
      ),
      cloudflare<{ enabled: boolean; previews_enabled: boolean }>(
        token,
        `/accounts/${accountId}/workers/scripts/${expected.workerName}/subdomain`,
        {},
        fetcher
      ).catch(() => null),
      cloudflare<{ subdomain?: string }>(
        token,
        `/accounts/${accountId}/workers/subdomain`,
        {},
        fetcher
      ),
      cloudflare<Array<{ uuid?: string; name?: string }>>(
        token,
        `/accounts/${accountId}/d1/database?per_page=100`,
        {},
        fetcher
      )
    ]);
  const bindings = normalizeBindings(settings.bindings);
  const d1 = requiredBinding(bindings, "DB", "d1");
  const r2 = requiredBinding(bindings, "MAIL_OBJECTS", "r2_bucket");
  requiredBinding(bindings, "MAIL_SENDER", "send_email");
  const databaseId = stringField(d1, "database_id", "id");
  const database = databases.find((candidate) => candidate.uuid === databaseId);
  if (!database?.name) {
    throw new AppError(
      "UPGRADE_D1_ACCOUNT_MISMATCH",
      "The bound Community database does not belong to the target Worker account.",
      409
    );
  }
  const bucketName = stringField(r2, "bucket_name");
  if (!accountSubdomain.subdomain) {
    throw new AppError(
      "UPGRADE_PREVIEW_UNAVAILABLE",
      "Cloudflare Preview URLs are not available for this account.",
      409
    );
  }
  const deployment = deployments.deployments?.[0];
  const active = deployment?.versions?.filter((version) => version.percentage === 100) ?? [];
  if (active.length !== 1 || !active[0]?.version_id) {
    throw new AppError(
      "UPGRADE_ACTIVE_VERSION_AMBIGUOUS",
      "The Community Worker does not have one active 100-percent version.",
      409
    );
  }
  const installationBinding = bindings.find((binding) => binding.name === "HQBASE_INSTALLATION_ID");
  const installedId =
    installationBinding?.type === "plain_text" && typeof installationBinding.text === "string"
      ? installationBinding.text
      : null;
  if (installedId && installedId !== expected.installationId) {
    throw new AppError(
      "UPGRADE_INSTALLATION_MISMATCH",
      "The discovered Worker belongs to a different HQBase installation.",
      409
    );
  }
  await verifySignedCommunityRelease(bindings, env, fetcher);
  await verifyCommunitySchema(env.DB);
  const routes = await listWorkerRoutes(token, accountId, expected.workerName, fetcher);
  const customDomains = domains
    .filter((domain) => domain.service === expected.workerName && domain.hostname)
    .map((domain) => String(domain.hostname))
    .sort();
  verifyWorkspaceOrigin(
    expected.workerName,
    accountSubdomain.subdomain,
    customDomains,
    routes,
    expected.workspaceOrigin
  );
  return {
    legacyRecovery: installedId === null,
    inventory: {
      accountId,
      workerName: expected.workerName,
      installationId: installedId,
      activeVersionId: active[0].version_id,
      bindings,
      secretNames: secrets.flatMap((secret) => (secret.name ? [secret.name] : [])).sort(),
      d1DatabaseId: databaseId,
      d1DatabaseName: database.name,
      r2BucketName: bucketName,
      compatibilityDate: settings.compatibility_date ?? null,
      compatibilityFlags: settings.compatibility_flags ?? [],
      routes,
      customDomains,
      assets: settings.assets ?? null,
      subdomain,
      accountSubdomain: accountSubdomain.subdomain
    }
  };
}

function verifyWorkspaceOrigin(
  workerName: string,
  accountSubdomain: string,
  customDomains: string[],
  routes: Array<{ pattern: string }>,
  workspaceOrigin: string
): void {
  const configured = new URL(workspaceOrigin).hostname;
  const workerHost = `${workerName}.${accountSubdomain}.workers.dev`;
  const routeHosts = routes.map((route) => route.pattern.split("/", 1)[0]?.replace(/^\*\./, ""));
  if (
    configured !== workerHost &&
    !customDomains.includes(configured) &&
    !routeHosts.some((host) => host && (configured === host || configured.endsWith(`.${host}`)))
  ) {
    throw new AppError(
      "UPGRADE_ORIGIN_MISMATCH",
      "The workspace origin is not attached to the verified Community Worker.",
      409
    );
  }
}

async function listWorkerRoutes(
  token: string,
  accountId: string,
  workerName: string,
  fetcher: typeof fetch
): Promise<Array<{ id: string; pattern: string }>> {
  const zones = await cloudflare<Array<{ id: string }>>(
    token,
    `/zones?account.id=${encodeURIComponent(accountId)}&per_page=100`,
    {},
    fetcher
  );
  const routes: Array<{ id: string; pattern: string }> = [];
  for (const zone of zones) {
    const values = await cloudflare<Array<{ id?: string; pattern?: string; script?: string }>>(
      token,
      `/zones/${zone.id}/workers/routes`,
      {},
      fetcher
    );
    for (const route of values) {
      if (route.script === workerName && route.id && route.pattern) {
        routes.push({ id: route.id, pattern: route.pattern });
      }
    }
  }
  return routes.sort((left, right) => left.pattern.localeCompare(right.pattern));
}

async function verifyCommunitySchema(db: D1Database): Promise<void> {
  const rows = await db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
    .all<{ name: string }>();
  const tables = new Set(rows.results.map((row) => row.name));
  const required = [
    "user",
    "session",
    "account",
    "app_settings",
    "mailboxes",
    "threads",
    "messages",
    "message_attachments"
  ];
  if (required.some((table) => !tables.has(table)) || tables.has("pro_schema_state")) {
    throw new AppError(
      "UPGRADE_SCHEMA_UNSUPPORTED",
      "This database is not a supported HQBase Community schema.",
      409
    );
  }
  const releaseState = await db
    .prepare("SELECT edition, installed_schema_version FROM app_release_state WHERE singleton = 1")
    .first<{ edition: string; installed_schema_version: number }>();
  if (
    releaseState?.edition !== "community" ||
    ![4, 5].includes(releaseState.installed_schema_version)
  ) {
    throw new AppError(
      "UPGRADE_SCHEMA_UNSUPPORTED",
      "This database is not a supported HQBase Community schema.",
      409
    );
  }
}

function normalizeBindings(
  values: Array<Record<string, unknown> & { name?: string; type?: string }> | undefined
): UpgradeInventory["bindings"] {
  return (values ?? []).filter(
    (binding): binding is Record<string, unknown> & { name: string; type: string } =>
      typeof binding.name === "string" && typeof binding.type === "string"
  );
}

function requiredBinding(
  bindings: UpgradeInventory["bindings"],
  name: string,
  type: string
): UpgradeInventory["bindings"][number] {
  const matches = bindings.filter((binding) => binding.name === name && binding.type === type);
  if (matches.length !== 1) {
    throw new AppError(
      "UPGRADE_BINDING_INVALID",
      `The Community Worker is missing the required ${name} binding.`,
      409
    );
  }
  const binding = matches[0];
  if (!binding) throw new Error("Required binding disappeared.");
  return binding;
}

function stringField(value: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    if (typeof value[name] === "string" && value[name]) return value[name];
  }
  throw new AppError("UPGRADE_BINDING_INVALID", "A required binding is malformed.", 409);
}

function publicCloudflareError(path: string, code?: number): string {
  if (path.includes("/d1/")) return "Cloudflare could not verify the Community database.";
  if (path.includes("/queues")) return "Cloudflare could not prepare the Pro job queues.";
  if (code === 10000) return "Cloudflare authorization expired. Authorize again to resume.";
  return "Cloudflare could not complete this upgrade step.";
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
