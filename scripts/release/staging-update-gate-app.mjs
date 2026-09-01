import { cloudflareHeaders, cloudflareResult } from "./staging-update-gate-shared.mjs";

export async function verifyUpdateTokenActive(context, dependencies) {
  const result = await cloudflareResult(
    "/user/tokens/verify",
    { headers: cloudflareHeaders(context.updateToken) },
    dependencies.fetcher
  );
  if (result?.status !== "active") {
    throw new Error(
      "The deployed update action revoked the persistent staging API token. Replace the staging token before another release."
    );
  }
}

export async function installationSnapshot(manifest, context, dependencies) {
  const [deployment, query] = await Promise.all([
    cloudflareResult(
      `/accounts/${context.accountId}/workers/scripts/${encodeURIComponent(context.workerName)}/deployments`,
      { headers: cloudflareHeaders(context.cleanupToken) },
      dependencies.fetcher
    ),
    cloudflareResult(
      `/accounts/${context.accountId}/d1/database/${manifest.d1.id}/query`,
      {
        body: JSON.stringify({
          sql: `SELECT (SELECT installed_version FROM release_state WHERE singleton = 1) AS installed_version, (SELECT installed_schema_version FROM release_state WHERE singleton = 1) AS installed_schema_version, (SELECT COUNT(*) FROM d1_migrations) AS normal_migration_count, (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations_after_deploy') AS after_deploy_ledger_table_count, (SELECT COUNT(*) FROM update_history) AS update_history_count, (SELECT COUNT(*) FROM app_settings WHERE key LIKE 'update_build_lock:%') AS update_build_lock_count, (SELECT COUNT(*) FROM "user") AS user_count, (SELECT COUNT(*) FROM mailboxes) AS mailbox_count, (SELECT COUNT(*) FROM drafts) AS draft_count, (SELECT COUNT(*) FROM messages) AS message_count, (SELECT value_json FROM app_settings WHERE key = 'release-updater-bridge-probe') AS probe`
        }),
        headers: cloudflareHeaders(context.cleanupToken, true),
        method: "POST"
      },
      dependencies.fetcher
    )
  ]);
  const versions = (deployment?.deployments ?? []).flatMap((item) => item.versions ?? []);
  const active = versions.find((version) => version.percentage === 100);
  const row = query?.[0]?.results?.[0];
  if (!active?.version_id || !row || row.update_build_lock_count !== 0) {
    throw new Error("Cloudflare did not return a clean active Worker and D1 staging snapshot.");
  }
  return { d1: row, workerVersionId: active.version_id };
}

export async function signIn(context, fetcher) {
  const response = await appRequest(
    context,
    "/api/auth/sign-in/email",
    {
      body: JSON.stringify({
        email: context.ownerEmail,
        password: context.ownerPassword,
        rememberMe: false
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    },
    fetcher
  );
  if (!response.ok) {
    throw new Error(`Staging owner sign-in returned HTTP ${response.status}.`);
  }
  const cookies = setCookieValues(response.headers)
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean);
  if (cookies.length === 0)
    throw new Error("Staging owner sign-in did not return a session cookie.");
  return cookies;
}

export async function appRequest(context, pathname, init, fetcher) {
  return fetcher(new URL(pathname, context.appUrl), {
    ...init,
    headers: {
      accept: "application/json",
      "CF-Access-Client-Id": context.accessClientId,
      "CF-Access-Client-Secret": context.accessClientSecret,
      origin: context.appUrl,
      ...init.headers
    },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000)
  });
}

export async function requireAppJson(response, status, operation) {
  if (response.status !== status) {
    throw new Error(
      `${operation} returned HTTP ${response.status} (${await appErrorCode(response)}).`
    );
  }
  return parseJson(response, operation);
}

export async function appErrorCode(response) {
  try {
    const body = await response.clone().json();
    return typeof body?.error?.code === "string" ? body.error.code : "unknown error";
  } catch {
    return "invalid response";
  }
}

export async function parseJson(response, operation) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${operation} returned invalid JSON.`);
  }
}

export function setCookieValues(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}
