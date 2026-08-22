import { optionalBoolean, optionalString, requireString } from "./args.mjs";
import { run } from "./command.mjs";
import { writeWranglerConfig } from "./config.mjs";
import { assertCurrentManifest, assertUnambiguousManifest } from "./lifecycle-manifest.mjs";
import {
  configPath,
  ensureDeploymentDir,
  loadManifest,
  manifestExists,
  writeManifest
} from "./manifest.mjs";
import { provisionResources } from "./provision.mjs";
import { prepareManifest, resolveCloudflareAccount, wrangler } from "./resources.mjs";

export function install(flags, options = {}) {
  const name = requireString(flags, "name");
  const dryRun = optionalBoolean(flags, "dry-run");
  const force = optionalBoolean(flags, "force");
  const domain = optionalString(flags, "domain");
  const noEmail = flags.email === false;
  const skipDeploy = optionalBoolean(flags, "skip-deploy");
  const skipBuild = optionalBoolean(flags, "skip-build");
  const runCommand = options.runCommand ?? run;
  const checkpoint = options.checkpoint ?? writeManifest;
  const exists = manifestExists(name);

  if (force) {
    throw new Error(
      "--force is not supported because overwriting lifecycle metadata can lose resource ownership. Existing verified manifests resume automatically."
    );
  }

  let manifest;
  if (exists) {
    manifest = loadManifest(name);
    assertMatchingInstallFlags(manifest, flags);
    if (dryRun) {
      assertCurrentManifest(manifest);
      assertUnambiguousManifest(manifest);
    }
  } else {
    manifest = createManifest(name, {
      appDomain: optionalString(flags, "app-domain"),
      authUrl: optionalString(flags, "auth-url"),
      oauthClientId: optionalString(flags, "oauth-client-id"),
      oauthMode: optionalString(flags, "oauth-mode"),
      domain,
      workerName: optionalString(flags, "worker-name"),
      d1Name: optionalString(flags, "d1-name"),
      r2Bucket: optionalString(flags, "r2-bucket"),
      queueName: optionalString(flags, "queue-name")
    });
  }

  if (!dryRun) {
    const accountId = resolveCloudflareAccount(
      manifest.version === 3 ? (manifest.accountId ?? undefined) : undefined,
      {
        environment: options.environment ?? process.env,
        runCommand
      }
    );
    if (exists) {
      manifest = prepareManifest(manifest, accountId, { checkpoint, runCommand });
    } else {
      manifest.accountId = accountId;
      checkpoint(manifest);
    }
    ensureDeploymentDir(name);
  }

  if (!skipBuild) {
    runCommand("pnpm", ["build"], { dryRun });
  }

  provisionResources(manifest, { checkpoint, dryRun, runCommand });

  writeWranglerConfig(manifest, { dryRun });

  if (!skipDeploy && !manifest.worker.deployed) {
    runCommand("node", ["scripts/release/deploy.mjs", "--config", configPath(name)], {
      dryRun,
      env: {
        CLOUDFLARE_ACCOUNT_ID: manifest.accountId,
        WORKERS_CI: "1",
        ...((optionalString(flags, "auth-secret") ?? process.env.HQBASE_AUTH_SECRET)
          ? {
              HQBASE_AUTH_SECRET:
                optionalString(flags, "auth-secret") ?? process.env.HQBASE_AUTH_SECRET
            }
          : {})
      }
    });
    manifest.worker.deployed = true;
    checkpoint(manifest, { dryRun });
  }

  if (domain && !noEmail) {
    configureEmail(manifest, {
      dryRun,
      noSending: flags.sending === false,
      runCommand
    });
    checkpoint(manifest, { dryRun });
  }

  console.log(`HQBase deployment "${name}" is ready.`);
}

export function createManifest(name, input) {
  const workerName = input.workerName ?? `hqbase-${name}`;
  const d1Name = input.d1Name ?? `hqbase-${name}`;
  const r2Bucket = input.r2Bucket ?? `hqbase-${name}-mail`;
  const queueName = input.queueName ?? `hqbase-${name}-jobs`;

  validateBucketName(r2Bucket);
  const cloudflareOAuth = cloudflareOAuthConfig({
    authUrl: input.authUrl,
    clientId: input.oauthClientId,
    mode: input.oauthMode
  });

  return {
    version: 3,
    name,
    createdAt: new Date().toISOString(),
    accountId: null,
    worker: { name: workerName, deployed: false },
    d1: {
      name: d1Name,
      id: null,
      ownership: "unclaimed"
    },
    r2: {
      bucket: r2Bucket,
      ownership: "unclaimed"
    },
    queue: {
      primary: { name: queueName, id: null, ownership: "unclaimed" },
      deadLetter: { name: `${queueName}-dlq`, id: null, ownership: "unclaimed" }
    },
    appDomain: input.appDomain,
    authUrl: input.authUrl,
    cloudflareOAuth,
    email: input.domain
      ? {
          domain: input.domain,
          routingEnabled: false,
          sendingEnabled: false,
          catchAllToWorker: false,
          previousCatchAll: null
        }
      : null
  };
}

function assertMatchingInstallFlags(manifest, flags) {
  const recorded = {
    "app-domain": manifest.appDomain,
    "auth-url": manifest.authUrl,
    "d1-name": manifest.d1?.name,
    domain: manifest.email?.domain,
    "oauth-client-id": manifest.cloudflareOAuth?.clientId,
    "oauth-mode": manifest.cloudflareOAuth?.mode,
    "queue-name": manifest.queue?.primary?.name ?? manifest.queue?.name,
    "r2-bucket": manifest.r2?.bucket,
    "worker-name": manifest.worker?.name
  };
  for (const [flag, expected] of Object.entries(recorded)) {
    const supplied = optionalString(flags, flag);
    if (supplied !== undefined && supplied !== expected) {
      throw new Error(
        `Refusing to resume: --${flag} is "${supplied}", but the manifest records "${expected ?? "no value"}".`
      );
    }
  }
}

export function cloudflareOAuthConfig({ authUrl, clientId, mode }) {
  const resolvedMode = mode ?? "official";
  if (resolvedMode !== "official" && resolvedMode !== "customer") {
    throw new Error('--oauth-mode must be "official" or "customer".');
  }
  if (resolvedMode === "official") {
    if (clientId) {
      throw new Error("--oauth-client-id requires --oauth-mode customer.");
    }
    return { mode: "official" };
  }
  if (!clientId || clientId.length > 256) {
    throw new Error("Customer-managed OAuth requires --oauth-client-id.");
  }
  validateCanonicalHttpsOrigin(authUrl);
  return { clientId, mode: "customer" };
}

function validateCanonicalHttpsOrigin(value) {
  if (!value) {
    throw new Error("Customer-managed OAuth requires --auth-url.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--auth-url must be a valid canonical HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("--auth-url must be a canonical HTTPS origin without a path.");
  }
}

function configureEmail(manifest, options) {
  const { domain } = manifest.email;
  wrangler(manifest, ["email", "routing", "enable", domain], options);
  manifest.email.routingEnabled = true;

  const previous = wrangler(manifest, ["email", "routing", "rules", "get", domain, "catch-all"], {
    ...options,
    allowFailure: true
  });
  manifest.email.previousCatchAll = previous || null;

  wrangler(
    manifest,
    [
      "email",
      "routing",
      "rules",
      "update",
      domain,
      "catch-all",
      "--enabled",
      "true",
      "--action-type",
      "worker",
      "--action-value",
      manifest.worker.name
    ],
    options
  );
  manifest.email.catchAllToWorker = true;

  if (!options.noSending) {
    wrangler(manifest, ["email", "sending", "enable", domain], options);
    manifest.email.sendingEnabled = true;
  }
}

function validateBucketName(name) {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name)) {
    throw new Error("R2 bucket names must be 3-63 lowercase letters, numbers, and hyphens.");
  }
}
