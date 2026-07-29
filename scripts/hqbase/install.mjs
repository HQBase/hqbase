import { optionalBoolean, optionalString, requireString } from "./args.mjs";
import { parseD1DatabaseId, run } from "./command.mjs";
import { writeWranglerConfig } from "./config.mjs";
import { configPath, ensureDeploymentDir, manifestExists, writeManifest } from "./manifest.mjs";

export function install(flags) {
  const name = requireString(flags, "name");
  const dryRun = optionalBoolean(flags, "dry-run");
  const force = optionalBoolean(flags, "force");
  const domain = optionalString(flags, "domain");
  const noEmail = flags.email === false;
  const skipDeploy = optionalBoolean(flags, "skip-deploy");
  const skipBuild = optionalBoolean(flags, "skip-build");

  if (manifestExists(name) && !force) {
    throw new Error(`Deployment "${name}" already exists. Use --force to overwrite metadata.`);
  }

  const manifest = createManifest(name, {
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

  if (!dryRun) {
    ensureDeploymentDir(name);
  }
  writeManifest(manifest, { dryRun });

  if (!skipBuild) {
    run("pnpm", ["build"], { dryRun });
  }

  const d1Output = run("pnpm", ["exec", "wrangler", "d1", "create", manifest.d1.name], {
    dryRun
  });
  if (!dryRun) {
    manifest.d1.id = parseD1DatabaseId(d1Output);
    manifest.d1.created = true;
    writeManifest(manifest);
  }

  run("pnpm", ["exec", "wrangler", "r2", "bucket", "create", manifest.r2.bucket], {
    dryRun
  });
  manifest.r2.created = true;
  writeManifest(manifest, { dryRun });

  run("pnpm", ["exec", "wrangler", "queues", "create", manifest.queue.name], { dryRun });
  run("pnpm", ["exec", "wrangler", "queues", "create", manifest.queue.deadLetterName], {
    dryRun
  });
  manifest.queue.created = true;
  writeManifest(manifest, { dryRun });

  writeWranglerConfig(manifest, { dryRun });

  if (!skipDeploy) {
    run("node", ["scripts/release/deploy.mjs", "--config", configPath(name)], {
      dryRun,
      env: {
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
    writeManifest(manifest, { dryRun });
  }

  if (domain && !noEmail) {
    configureEmail(manifest, { dryRun, noSending: flags.sending === false });
    writeManifest(manifest, { dryRun });
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
    version: 2,
    name,
    createdAt: new Date().toISOString(),
    worker: { name: workerName, deployed: false },
    d1: {
      name: d1Name,
      id: "00000000-0000-0000-0000-000000000000",
      created: false,
      reused: false
    },
    r2: {
      bucket: r2Bucket,
      created: false,
      reused: false
    },
    queue: { name: queueName, deadLetterName: `${queueName}-dlq`, created: false },
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
  run("pnpm", ["exec", "wrangler", "email", "routing", "enable", domain], options);
  manifest.email.routingEnabled = true;

  const previous = run(
    "pnpm",
    ["exec", "wrangler", "email", "routing", "rules", "get", domain, "catch-all"],
    { ...options, allowFailure: true }
  );
  manifest.email.previousCatchAll = previous || null;

  run(
    "pnpm",
    [
      "exec",
      "wrangler",
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
    run("pnpm", ["exec", "wrangler", "email", "sending", "enable", domain], options);
    manifest.email.sendingEnabled = true;
  }
}

function validateBucketName(name) {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name)) {
    throw new Error("R2 bucket names must be 3-63 lowercase letters, numbers, and hyphens.");
  }
}
