#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { applyMigrationPhase } from "../d1-migrations.mjs";
import { recordWorkerDeployedForConfig } from "../hqbase/manifest.mjs";
import { windowsSystem32Executable } from "../windows-system32.mjs";
import { inspectActiveRelease } from "./active-version.mjs";
import { capture, run } from "./command.mjs";
import {
  compareVersions,
  hqbaseReleaseTag,
  loadVerifiedRelease,
  normalizeConfig,
  verifyManifest
} from "./manifest.mjs";
import {
  deploySource,
  executeSql,
  missingRequiredSecrets,
  needsInitialAuthSecret,
  workerNameFromConfig
} from "./worker-deploy.mjs";

const root = resolve(import.meta.dirname, "../..");

export {
  compareVersions,
  deploySource,
  executeSql,
  hqbaseReleaseTag,
  loadVerifiedRelease,
  missingRequiredSecrets,
  needsInitialAuthSecret,
  normalizeConfig,
  verifyManifest,
  workerNameFromConfig
};

export async function deploy(options = {}) {
  const configFile = resolve(options.configFile ?? resolve(root, "wrangler.jsonc"));
  if (process.env.HQBASE_FORCE_SOURCE_DEPLOY === "1") {
    assertSourceDeployConfig(configFile);
    return sourceDeploy(root);
  }
  const { bytes, manifest } = await loadVerifiedRelease({
    artifactFile: options.artifactFile ?? process.env.HQBASE_RELEASE_ARTIFACT_FILE,
    expectedVersion: options.expectedVersion ?? process.env.HQBASE_EXPECTED_RELEASE_VERSION,
    fetcher: options.fetcher,
    manifestFile: options.manifestFile ?? process.env.HQBASE_RELEASE_MANIFEST_FILE,
    manifestUrl: process.env.HQBASE_RELEASE_MANIFEST_URL
  });

  const workspace = mkdtempSync(resolve(tmpdir(), "hqbase-release-"));
  let recovery = null;
  try {
    const archive = resolve(workspace, "release.tar.gz");
    const source = resolve(workspace, "source");
    writeFileSync(archive, bytes);
    mkdirSync(source, { recursive: true });
    run(archiveExtractor(), ["-xzf", archive, "-C", source], root);
    const config = normalizeConfig(
      JSON.parse(readFileSync(configFile, "utf8")),
      manifest.version,
      manifest.artifact.sha256
    );
    const recordWorkerDeployed = () => recordWorkerDeployedForConfig(configFile, config.name);
    writeFileSync(resolve(source, "wrangler.jsonc"), `${JSON.stringify(config, null, 2)}\n`);
    run("pnpm", ["install", "--frozen-lockfile"], source);
    run("pnpm", ["build"], source);
    const activeRelease = inspectActiveRelease(source, config.name);
    const releaseTag = hqbaseReleaseTag(manifest.version, manifest.artifact.sha256);
    if (options.configurationOnly) {
      // A configuration deployment re-applies routes and Worker variables for the release that is
      // already active. `wrangler triggers deploy` is experimental and never updates variables.
      if (!activeRelease) {
        throw new Error(
          "Refusing to deploy configuration: the Worker has no active signed HQBase release."
        );
      }
      if (activeRelease.version !== manifest.version || activeRelease.tag !== releaseTag) {
        throw new Error(
          `Refusing to deploy configuration: the Worker runs HQBase ${activeRelease.version}, not the signed stable release ${manifest.version}. Update the deployment first.`
        );
      }
      deployConfiguration(source, config.name, releaseTag);
      recordWorkerDeployed();
      console.log(`HQBase ${manifest.version} configuration deployed.`);
      return;
    }
    if (!activeRelease) {
      applyMigrationPhase(source, "normal", { target: "remote" });
      deploySource(source, { releaseTag });
      recordWorkerDeployed();
      applyMigrationPhase(source, "after-deploy", { target: "remote" });
      executeSql(
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
      completeActiveReleaseRetry(source, manifest, recordWorkerDeployed);
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
    if (!bookmark || !workerVersion) {
      throw new Error("Could not establish the update recovery checkpoint.");
    }
    recovery = { bookmark, cleanupComplete: false, configFile, workerVersion, name: config.name };
    applyMigrationPhase(source, "normal", { target: "remote" });
    const updateId = randomUUID();
    executeSql(
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
    recordWorkerDeployed();
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
    applyMigrationPhase(source, "after-deploy", { target: "remote" });
    recovery.cleanupComplete = true;
    executeSql(
      source,
      `UPDATE release_state SET installed_version = ${quote(manifest.version)}, installed_schema_version = ${manifest.schemaVersion}, updated_at = datetime('now') WHERE singleton = 1; UPDATE update_history SET state = 'verified', completed_at = datetime('now') WHERE id = ${quote(updateId)}`
    );
    console.log(`HQBase updated to ${manifest.version}.`);
  } catch (error) {
    if (recovery) reportRecovery(recovery);
    throw error;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

export function archiveExtractor(options = {}) {
  const platform = options.platform ?? process.platform;
  return platform === "win32" ? windowsSystem32Executable("tar.exe", options.environment) : "tar";
}

export function assertSourceDeployConfig(
  configFile,
  sourceConfigFile = resolve(root, "wrangler.jsonc")
) {
  const selectedConfig = resolve(configFile);
  const repositoryConfig = resolve(sourceConfigFile);
  if (selectedConfig !== repositoryConfig) {
    throw new Error(
      "HQBASE_FORCE_SOURCE_DEPLOY supports only the repository-root wrangler.jsonc. Unset it before deploying a managed installation."
    );
  }
  return repositoryConfig;
}

export function deployConfiguration(source, workerName, releaseTag, options = {}) {
  const runCommand = options.run ?? run;
  const inspect = options.inspect ?? inspectActiveRelease;
  const before = inspect(source, workerName);
  runCommand(
    "pnpm",
    [
      "exec",
      "wrangler",
      "deploy",
      "--strict",
      "--keep-vars",
      "--config",
      "wrangler.jsonc",
      "--tag",
      releaseTag,
      "--var",
      `HQBASE_WORKER_NAME:${workerName}`
    ],
    source
  );
  const after = inspect(source, workerName);
  if (!after || after.tag !== releaseTag || after.versionId === before?.versionId) {
    throw new Error(
      "Refusing to continue: Cloudflare does not report a new active version for the configuration deployment."
    );
  }
  return after;
}

export function completeActiveReleaseRetry(source, manifest, recordWorkerDeployed, options = {}) {
  const applyMigrations = options.applyMigrationPhase ?? applyMigrationPhase;
  const updateReleaseState = options.executeSql ?? executeSql;
  recordWorkerDeployed();
  applyMigrations(source, "normal", { target: "remote" });
  applyMigrations(source, "after-deploy", { target: "remote" });
  updateReleaseState(
    source,
    `UPDATE release_state SET installed_version = ${quote(manifest.version)}, installed_schema_version = ${manifest.schemaVersion}, updated_at = datetime('now') WHERE singleton = 1; UPDATE update_history SET state = 'verified', completed_at = datetime('now') WHERE state IN ('started', 'deployed') AND id = (SELECT id FROM update_history WHERE to_version = ${quote(manifest.version)} AND state IN ('started', 'deployed') ORDER BY started_at DESC, rowid DESC LIMIT 1)`
  );
}

function sourceDeploy(cwd) {
  run("pnpm", ["build"], cwd);
  applyMigrationPhase(cwd, "normal", { target: "remote" });
  deploySource(cwd);
  applyMigrationPhase(cwd, "after-deploy", { target: "remote" });
  run("pnpm", ["hqbase", "postdeploy"], cwd);
}

export function reportRecovery(recovery) {
  if (recovery.cleanupComplete) {
    console.error(
      "Recovery: rerun the same signed HQBase deployment. Schema cleanup completed, and the retry will finish release bookkeeping."
    );
    return;
  }
  const config = shellQuote(recovery.configFile);
  console.error("Run these recovery commands in order:");
  console.error(
    `Worker recovery: pnpm exec wrangler versions deploy ${shellQuote(`${recovery.workerVersion}@100%`)} --name ${shellQuote(recovery.name)} --config ${config}`
  );
  console.error(
    `D1 recovery: pnpm exec wrangler d1 time-travel restore DB --bookmark ${shellQuote(recovery.bookmark)} --config ${config}`
  );
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
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
  await deploy({ configFile, configurationOnly: process.argv.includes("--configuration-only") });
}
