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
    authUrl: optionalString(flags, "auth-url"),
    domain,
    workerName: optionalString(flags, "worker-name"),
    d1Name: optionalString(flags, "d1-name"),
    r2Bucket: optionalString(flags, "r2-bucket")
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

  writeSecretFile(name, optionalString(flags, "auth-secret"), { dryRun });
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

export function createManifest(name, input) {
  const workerName = input.workerName ?? `hqbase-${name}`;
  const d1Name = input.d1Name ?? `hqbase-${name}`;
  const r2Bucket = input.r2Bucket ?? `hqbase-${name}-mail`;

  validateBucketName(r2Bucket);

  return {
    version: 1,
    name,
    installationId: input.installationId ?? crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    worker: { name: workerName, deployed: false },
    d1: { name: d1Name, id: "00000000-0000-0000-0000-000000000000", created: false },
    r2: { bucket: r2Bucket, created: false },
    appDomain: input.appDomain,
    authUrl: input.authUrl,
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

function writeSecretFile(name, providedSecret, options = {}) {
  if (options.dryRun) {
    return;
  }
  const secret = providedSecret ?? crypto.randomBytes(32).toString("base64url");
  fs.writeFileSync(
    secretsPath(name),
    `${JSON.stringify({ BETTER_AUTH_SECRET: secret }, null, 2)}\n`,
    { mode: 0o600 }
  );
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
