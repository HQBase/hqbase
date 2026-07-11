import crypto from "node:crypto";
import fs from "node:fs";

import { optionalBoolean, optionalString, requireString } from "./args.mjs";
import { parseD1DatabaseId, run } from "./command.mjs";
import { writeWranglerConfig } from "./config.mjs";
import {
  configPath,
  ensureDeploymentDir,
  manifestExists,
  secretsPath,
  writeManifest
} from "./manifest.mjs";

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
    serviceDomain: optionalString(flags, "service-domain"),
    authUrl: optionalString(flags, "auth-url"),
    billingService: optionalString(flags, "billing-service"),
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

  const d1Output = run("pnpm", ["exec", "wrangler", "d1", "create", manifest.d1.name], { dryRun });
  if (!dryRun) {
    manifest.d1.id = parseD1DatabaseId(d1Output);
    manifest.d1.created = true;
    writeManifest(manifest);
  }

  run("pnpm", ["exec", "wrangler", "r2", "bucket", "create", manifest.r2.bucket], { dryRun });
  manifest.r2.created = true;
  writeManifest(manifest, { dryRun });

  run("pnpm", ["exec", "wrangler", "queues", "create", manifest.queue.name], { dryRun });
  run("pnpm", ["exec", "wrangler", "queues", "create", manifest.queue.deadLetterName], {
    dryRun
  });
  manifest.queue.created = true;
  writeManifest(manifest, { dryRun });

  writeSecretFile(
    name,
    {
      authSecret: optionalString(flags, "auth-secret"),
      appPasswordPepper: optionalString(flags, "app-password-pepper"),
      bridgeToken: optionalString(flags, "bridge-token"),
      entitlementSecret: optionalString(flags, "entitlement-secret"),
      sessionSecret: optionalString(flags, "session-secret")
    },
    { dryRun }
  );
  writeWranglerConfig(manifest, { dryRun });

  run(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      manifest.d1.name,
      "--remote",
      "--config",
      configPath(name)
    ],
    { dryRun }
  );

  if (!skipDeploy) {
    run(
      "pnpm",
      [
        "exec",
        "wrangler",
        "deploy",
        "--config",
        configPath(name),
        "--secrets-file",
        secretsPath(name)
      ],
      { dryRun }
    );
    manifest.worker.deployed = true;
    writeManifest(manifest, { dryRun });
  }

  if (domain && !noEmail) {
    configureEmail(manifest, { dryRun, noSending: flags.sending === false });
    writeManifest(manifest, { dryRun });
  }

  console.log(`HQBase deployment "${name}" is ready.`);
}

function createManifest(name, input) {
  const workerName = input.workerName ?? `hqbase-pro-${name}`;
  const d1Name = input.d1Name ?? `hqbase-pro-${name}`;
  const r2Bucket = input.r2Bucket ?? `hqbase-pro-${name}-mail`;
  const queueName = input.queueName ?? `hqbase-pro-${name}-jobs`;

  validateBucketName(r2Bucket);

  return {
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    worker: { name: workerName, deployed: false },
    d1: { name: d1Name, id: "00000000-0000-0000-0000-000000000000", created: false },
    r2: { bucket: r2Bucket, created: false },
    queue: { name: queueName, deadLetterName: `${queueName}-dlq`, created: false },
    appDomain: input.appDomain,
    serviceDomain: input.serviceDomain,
    authUrl: input.authUrl,
    billingService: input.billingService,
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

function writeSecretFile(name, provided, options = {}) {
  if (options.dryRun) {
    return;
  }
  const secrets = {
    BETTER_AUTH_SECRET: provided.authSecret ?? crypto.randomBytes(32).toString("base64url"),
    PRO_APP_PASSWORD_PEPPER:
      provided.appPasswordPepper ?? crypto.randomBytes(32).toString("base64url"),
    PRO_BRIDGE_TOKEN: provided.bridgeToken ?? crypto.randomBytes(32).toString("base64url"),
    PRO_ENTITLEMENT_SECRET:
      provided.entitlementSecret ?? crypto.randomBytes(32).toString("base64url"),
    PRO_SESSION_SECRET: provided.sessionSecret ?? crypto.randomBytes(32).toString("base64url")
  };
  fs.writeFileSync(secretsPath(name), `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
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
