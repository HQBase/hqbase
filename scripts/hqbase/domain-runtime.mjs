import { randomUUID } from "node:crypto";

import { configPath } from "./manifest.mjs";

const discoveryPath = "/api/v1/openapi.json";
const defaultProbeTimeoutMs = 5_000;

export function setCanonicalPortal({ hostname, manifest, runCommand, zoneId }) {
  const statements = [];
  if (hostname) {
    const quotedHostname = quoteSql(hostname);
    const quotedZoneId = zoneId ? quoteSql(zoneId) : "NULL";
    statements.push(
      `INSERT INTO workspace_hosts (id, hostname, zone_id, kind, is_canonical, status, verified_at, created_at, updated_at) VALUES (${quoteSql(`host_${randomUUID()}`)}, ${quotedHostname}, ${quotedZoneId}, 'portal', 0, 'ready', datetime('now'), datetime('now'), datetime('now')) ON CONFLICT(hostname) DO UPDATE SET zone_id = COALESCE(excluded.zone_id, workspace_hosts.zone_id), status = 'ready', verified_at = datetime('now'), updated_at = datetime('now')`,
      `UPDATE workspace_hosts SET is_canonical = 0, updated_at = datetime('now') WHERE kind = 'portal' AND is_canonical = 1 AND hostname <> ${quotedHostname}`,
      `UPDATE workspace_hosts SET is_canonical = 1, updated_at = datetime('now') WHERE kind = 'portal' AND hostname = ${quotedHostname}`
    );
  } else {
    statements.push(
      "UPDATE workspace_hosts SET is_canonical = 0, updated_at = datetime('now') WHERE kind = 'portal'"
    );
  }

  executeD1(manifest, statements, runCommand);
  const actual = readCanonicalPortal({ manifest, runCommand });
  if (actual !== (hostname ?? null)) {
    throw new Error(
      `Refusing to continue: D1 reports canonical portal ${actual ?? "none"}, not ${hostname ?? "none"}.`
    );
  }
}

export function readCanonicalPortal({ manifest, runCommand }) {
  const output = executeD1(
    manifest,
    ["SELECT hostname FROM workspace_hosts WHERE kind = 'portal' AND is_canonical = 1"],
    runCommand
  );
  return canonicalHostnameFromD1Output(output);
}

export function canonicalHostnameFromD1Output(output) {
  let payload;
  try {
    payload = JSON.parse(output);
  } catch {
    throw new Error("Could not parse the canonical portal check from Wrangler JSON output.");
  }
  const batches = Array.isArray(payload) ? payload : [payload];
  const result = [...batches].reverse().find((candidate) => Array.isArray(candidate?.results));
  if (!result) {
    throw new Error("Wrangler did not return the canonical portal check result.");
  }
  if (result.results.length > 1) {
    throw new Error("D1 reports more than one canonical portal hostname.");
  }
  const hostname = result.results[0]?.hostname;
  if (hostname == null) return null;
  if (typeof hostname !== "string" || !hostname) {
    throw new Error("Wrangler returned an invalid canonical portal hostname.");
  }
  return hostname;
}

export function createDomainProbe(
  environment = process.env,
  fetchImpl = globalThis.fetch,
  options = {}
) {
  const clientId = environment.HQBASE_DOMAIN_ACCESS_CLIENT_ID?.trim();
  const clientSecret = environment.HQBASE_DOMAIN_ACCESS_CLIENT_SECRET?.trim();
  const timeoutMs = options.timeoutMs ?? defaultProbeTimeoutMs;
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error(
      "Set both HQBASE_DOMAIN_ACCESS_CLIENT_ID and HQBASE_DOMAIN_ACCESS_CLIENT_SECRET, or neither."
    );
  }
  return async (url) => {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        ...(clientId
          ? {
              "cf-access-client-id": clientId,
              "cf-access-client-secret": clientSecret
            }
          : {})
      },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const document = await response.json();
    return document?.servers?.[0]?.url;
  };
}

export async function probeServiceOrigin({ origin, probe, retry }) {
  const { attempts, delayMs } = retry;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const advertised = await probe(`${origin}${discoveryPath}`);
      if (typeof advertised === "string" && advertised) return advertised.replace(/\/$/, "");
      lastError = new Error("the installation did not advertise a service origin");
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(
    `Refusing to continue: ${origin} did not serve a healthy HQBase installation (${lastError?.message ?? "no response"}). DNS or the certificate is not ready.`
  );
}

function executeD1(manifest, statements, runCommand) {
  return runCommand(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      manifest.d1.name,
      "--remote",
      "--yes",
      "--json",
      "--command",
      `${statements.join("; ")};`,
      "--config",
      configPath(manifest.name)
    ],
    {
      env: { CLOUDFLARE_ACCOUNT_ID: manifest.accountId },
      quiet: true,
      stdoutOnly: true
    }
  );
}

function quoteSql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
