#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { inspectActiveRelease, isWorkerNotFound } from "./active-version.mjs";

const root = resolve(import.meta.dirname, "../..");
const packageVersion = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const publicKey = "MCowBQYDK2VwAyEAsVwKniCvpHDwbbnjTPP0SuIIG97cRL+iFBQvay9OrU4=";
const stableManifestUrl = "https://github.com/HQBase/hqbase/releases/latest/download/stable.json";

export async function deploy(options = {}) {
  const configFile = resolve(options.configFile ?? resolve(root, "wrangler.jsonc"));
  if (process.env.HQBASE_FORCE_SOURCE_DEPLOY === "1") return sourceDeploy(root);
  const response = await fetch(process.env.HQBASE_RELEASE_MANIFEST_URL ?? stableManifestUrl);
  if (!response.ok) throw new Error(`Release check failed (${response.status}).`);
  const manifest = verifyManifest(await response.json());
  if (compareVersions(manifest.version, packageVersion) < 0) {
    throw new Error(
      `HQBase ${packageVersion} has not been published as a signed stable release yet.`
    );
  }

  const workspace = mkdtempSync(resolve(tmpdir(), "hqbase-release-"));
  let recovery = null;
  try {
    const artifactResponse = await fetch(manifest.artifact.url);
    if (!artifactResponse.ok)
      throw new Error(`Release download failed (${artifactResponse.status}).`);
    const bytes = Buffer.from(await artifactResponse.arrayBuffer());
    if (
      bytes.length !== manifest.artifact.size ||
      createHash("sha256").update(bytes).digest("hex") !== manifest.artifact.sha256
    )
      throw new Error("Release artifact integrity check failed.");
    const archive = resolve(workspace, "release.tar.gz");
    const source = resolve(workspace, "source");
    writeFileSync(archive, bytes);
    run("mkdir", ["-p", source], root);
    run("tar", ["-xzf", archive, "-C", source], root);
    const config = normalizeConfig(
      JSON.parse(readFileSync(configFile, "utf8")),
      manifest.version,
      manifest.artifact.sha256
    );
    writeFileSync(resolve(source, "wrangler.jsonc"), `${JSON.stringify(config, null, 2)}\n`);
    run("pnpm", ["install", "--frozen-lockfile"], source);
    run("pnpm", ["build"], source);
    const activeRelease = inspectActiveRelease(source, config.name);
    const releaseTag = hqbaseReleaseTag(manifest.version, manifest.artifact.sha256);
    if (!activeRelease) {
      run(
        "pnpm",
        [
          "exec",
          "wrangler",
          "d1",
          "migrations",
          "apply",
          "DB",
          "--remote",
          "--config",
          "wrangler.jsonc"
        ],
        source
      );
      deploySource(source, { releaseTag });
      sql(
        source,
        `UPDATE release_state SET installed_version = ${quote(manifest.version)}, installed_schema_version = ${manifest.schemaVersion}, updated_at = datetime('now') WHERE singleton = 1`
      );
      run("pnpm", ["hqbase", "postdeploy"], source);
      console.log(`HQBase ${manifest.version} installed from its signed release.`);
      return;
    }
    if (compareVersions(activeRelease.version, manifest.version) > 0) {
      throw new Error("The active HQBase Worker is newer than the signed stable release.");
    }
    if (compareVersions(activeRelease.version, manifest.minVersion) < 0) {
      throw new Error(
        `HQBase ${activeRelease.version} cannot update directly to ${manifest.version}.`
      );
    }
    if (activeRelease.version === manifest.version && activeRelease.tag === releaseTag) {
      console.log(`HQBase ${manifest.version} is already the active signed release.`);
      return;
    }
    const bookmark = findString(
      JSON.parse(
        capture(
          "pnpm",
          [
            "exec",
            "wrangler",
            "d1",
            "time-travel",
            "info",
            "DB",
            "--json",
            "--config",
            "wrangler.jsonc"
          ],
          source
        )
      ),
      "bookmark"
    );
    const workerVersion = activeRelease.versionId;
    if (!bookmark || !workerVersion)
      throw new Error("Could not establish the update recovery checkpoint.");
    recovery = { bookmark, workerVersion, name: config.name };
    run(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "migrations",
        "apply",
        "DB",
        "--remote",
        "--config",
        "wrangler.jsonc"
      ],
      source
    );
    const updateId = crypto.randomUUID();
    sql(
      source,
      `INSERT INTO update_history (id, from_version, to_version, checkpoint_bookmark, worker_version, state, started_at) VALUES (${quote(updateId)}, ${quote(activeRelease.version)}, ${quote(manifest.version)}, ${quote(bookmark)}, ${quote(workerVersion)}, 'started', datetime('now'))`
    );
    run(
      "pnpm",
      [
        "exec",
        "wrangler",
        "deploy",
        "--keep-vars",
        "--config",
        "wrangler.jsonc",
        "--tag",
        releaseTag,
        "--var",
        `HQBASE_WORKER_NAME:${config.name}`
      ],
      source
    );
    capture(
      "pnpm",
      [
        "exec",
        "wrangler",
        "deployments",
        "status",
        "--name",
        config.name,
        "--json",
        "--config",
        "wrangler.jsonc"
      ],
      source
    );
    sql(
      source,
      `UPDATE release_state SET installed_version = ${quote(manifest.version)}, installed_schema_version = ${manifest.schemaVersion}, updated_at = datetime('now') WHERE singleton = 1; UPDATE update_history SET state = 'verified', completed_at = datetime('now') WHERE id = ${quote(updateId)}`
    );
    console.log(`HQBase updated to ${manifest.version}.`);
  } catch (error) {
    if (recovery) {
      console.error(
        `D1 recovery: pnpm exec wrangler d1 time-travel restore DB --bookmark ${recovery.bookmark} --config wrangler.jsonc`
      );
      console.error(
        `Worker recovery: pnpm exec wrangler versions deploy ${recovery.workerVersion}@100% --name ${recovery.name} --config wrangler.jsonc`
      );
    }
    throw error;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

export function verifyManifest(envelope, publicKeyBase64 = publicKey) {
  const key = createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki"
  });
  if (
    !verify(
      null,
      Buffer.from(envelope.payload, "base64url"),
      key,
      Buffer.from(envelope.signature, "base64url")
    )
  )
    throw new Error("Release manifest signature is invalid.");
  const manifest = JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8"));
  if (
    manifest.format !== "hqbase-release-v1" ||
    manifest.product !== "hqbase" ||
    manifest.channel !== "stable" ||
    !/^\d+\.\d+\.\d+/.test(manifest.version) ||
    !/^\d+\.\d+\.\d+/.test(manifest.minVersion) ||
    !/^[a-f0-9]{64}$/.test(manifest.artifact?.sha256) ||
    !Number.isInteger(manifest.artifact?.size) ||
    manifest.artifact.size <= 0
  )
    throw new Error("Release manifest is incompatible.");
  return manifest;
}
export function compareVersions(left, right) {
  const a = left.split("-")[0].split(".").map(Number);
  const b = right.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference) return difference;
  }
  return 0;
}
export function normalizeConfig(config, version, artifactSha256) {
  return {
    ...config,
    $schema: "./node_modules/wrangler/config-schema.json",
    main: "worker/index.ts",
    compatibility_flags: [
      ...new Set([...(config.compatibility_flags ?? []), "global_fetch_strictly_public"])
    ],
    assets: {
      ...config.assets,
      directory: "./dist"
    },
    vars: {
      ...config.vars,
      HQBASE_APP_VERSION: version,
      ...(artifactSha256 ? { HQBASE_RELEASE_ARTIFACT_SHA256: artifactSha256 } : {}),
      HQBASE_WORKER_NAME: workerNameFromConfig(config)
    },
    d1_databases: config.d1_databases?.map((binding) => ({
      ...binding,
      migrations_dir: "migrations"
    }))
  };
}
export function hqbaseReleaseTag(version, artifactSha256) {
  if (!/^\d+\.\d+\.\d+/.test(version) || !/^[a-f0-9]{64}$/.test(artifactSha256))
    throw new Error("HQBase release identity is invalid.");
  return `hqbase:${version}:${artifactSha256}`;
}
function sourceDeploy(cwd) {
  run("pnpm", ["build"], cwd);
  run("pnpm", ["db:migrate:remote"], cwd);
  deploySource(cwd);
  run("pnpm", ["hqbase", "postdeploy"], cwd);
}
export function deploySource(cwd, options = {}) {
  const execute = options.run ?? run;
  const attempt = options.attempt ?? attemptRun;
  const workersCi = options.workersCi ?? process.env.WORKERS_CI === "1";
  const workerName = options.workerName ?? workerNameFromConfigFile(resolve(cwd, "wrangler.jsonc"));
  const deployArgs = [
    "exec",
    "wrangler",
    "deploy",
    "--keep-vars",
    "--var",
    `HQBASE_WORKER_NAME:${workerName}`
  ];
  if (options.releaseTag) deployArgs.push("--tag", options.releaseTag);

  if (!workersCi) {
    execute("pnpm", deployArgs, cwd);
    return;
  }

  const inspection = attempt(
    "pnpm",
    ["exec", "wrangler", "secret", "list", "--format", "json"],
    cwd
  );
  let needsSecret;
  try {
    needsSecret = needsInitialAuthSecret(inspection, "BETTER_AUTH_SECRET");
  } catch (error) {
    emitCommandOutput(inspection);
    throw error;
  }
  if (!needsSecret) {
    execute("pnpm", deployArgs, cwd);
    return;
  }

  deployArgs.push(
    "--var",
    `HQBASE_INSTALLATION_ID:${options.randomUUID?.() ?? crypto.randomUUID()}`
  );

  const workspace = mkdtempSync(resolve(tmpdir(), "hqbase-secrets-"));
  const secretsFile = resolve(workspace, "secrets.json");
  try {
    const configuredSecret = process.env.HQBASE_AUTH_SECRET;
    const bytes = configuredSecret ? null : (options.randomBytes ?? randomBytes)(32);
    writeFileSync(
      secretsFile,
      `${JSON.stringify({
        BETTER_AUTH_SECRET: configuredSecret ?? bytes?.toString("base64url")
      })}\n`,
      { mode: 0o600 }
    );
    execute("pnpm", [...deployArgs, "--secrets-file", secretsFile], cwd);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
export function workerNameFromConfig(config) {
  if (typeof config?.name !== "string" || !config.name.trim()) {
    throw new Error("wrangler.jsonc must define the deployed Worker name.");
  }
  return config.name.trim();
}
function workerNameFromConfigFile(configFile) {
  return workerNameFromConfig(JSON.parse(readFileSync(configFile, "utf8")));
}
export function needsInitialAuthSecret(result, secretName) {
  if (result.status === 0) {
    const secrets = JSON.parse(result.stdout || "[]");
    if (!Array.isArray(secrets)) throw new Error("Wrangler returned an invalid secret list.");
    return !secrets.some((secret) => secret?.name === secretName);
  }
  if (isWorkerNotFound(result)) {
    return true;
  }
  throw result.error ?? new Error(`wrangler secret list exited with status ${result.status}.`);
}
function sql(cwd, command) {
  run(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--remote",
      "--command",
      command,
      "--config",
      "wrangler.jsonc"
    ],
    cwd
  );
}
function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, CI: process.env.CI ?? "true" },
    stdio: "inherit"
  });
}
function capture(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    env: { ...process.env, CI: process.env.CI ?? "true" },
    encoding: "utf8"
  });
}
function attemptRun(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    env: { ...process.env, CI: process.env.CI ?? "true" },
    encoding: "utf8"
  });
}
function emitCommandOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}
function findString(value, ...keys) {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key) && typeof child === "string") return child;
    const nested = findString(child, ...keys);
    if (nested) return nested;
  }
  return null;
}
function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const configIndex = process.argv.indexOf("--config");
  const configFile = configIndex >= 0 ? process.argv[configIndex + 1] : undefined;
  await deploy({ configFile });
}
