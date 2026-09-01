#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { applyMigrationPhase } from "../d1-migrations.mjs";
import { recordWorkerDeployedForConfig } from "../hqbase/manifest.mjs";
import { windowsSystem32Executable } from "../windows-system32.mjs";
import { assertRequiredActiveBindings, inspectActiveRelease } from "./active-version.mjs";
import { inspectRemoteAfterDeployState } from "./after-deploy-state.mjs";
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
      manifest.artifact.sha256,
      JSON.parse(readFileSync(resolve(source, "wrangler.jsonc"), "utf8"))
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
      assertRequiredActiveBindings(inspectActiveRelease(source, config.name));
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
      const afterDeployState = inspectRemoteAfterDeployState(source, manifest.version);
      let retryActiveRelease = activeRelease;
      if (activeRelease.missingBindings.length > 0) {
        retryActiveRelease = deployConfiguration(source, config.name, releaseTag);
      }
      const retry = completeActiveReleaseRetry(source, manifest, recordWorkerDeployed, {
        activeRelease: retryActiveRelease,
        afterDeployState,
        configFile,
        workerName: config.name,
        onRecovery: (checkpoint) => {
          recovery = checkpoint;
        }
      });
      if (activeRelease.missingBindings.length > 0 && !retry.workerRecorded) {
        recordWorkerDeployed();
      }
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
    assertRequiredActiveBindings(inspectActiveRelease(source, config.name));
    recordWorkerDeployed();
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
  return assertRequiredActiveBindings(after);
}

export function completeActiveReleaseRetry(source, manifest, recordWorkerDeployed, options = {}) {
  const applyMigrations = options.applyMigrationPhase ?? applyMigrationPhase;
  const updateReleaseState = options.executeSql ?? executeSql;
  const afterDeployState =
    options.afterDeployState ??
    (options.inspectAfterDeployState ?? inspectRemoteAfterDeployState)(source, manifest.version);
  if (!["S0", "S1", "S2", "S3"].includes(afterDeployState?.phase)) {
    throw new Error("Refusing to repair HQBase because the D1 post-deploy state is invalid.");
  }

  let update = afterDeployState.pendingUpdate;
  if (afterDeployState.phase === "S3" && !update) {
    return { phase: "S3", repaired: false, workerRecorded: false };
  }

  let checkpoint;
  if (update) {
    checkpoint = {
      bookmark: update.checkpoint_bookmark,
      cleanupComplete: afterDeployState.phase === "S3",
      configFile: options.configFile,
      name: options.workerName,
      workerVersion: update.worker_version
    };
  } else {
    const workerVersion = options.activeRelease?.versionId;
    if (!workerVersion) throw new Error("Could not establish the update recovery checkpoint.");
    const bookmark = (options.createRecoveryBookmark ?? createRecoveryBookmark)(source, options);
    const updateId = (options.randomUUID ?? randomUUID)();
    if (!bookmark) throw new Error("Could not establish the update recovery checkpoint.");
    update = {
      checkpoint_bookmark: bookmark,
      from_version: manifest.version,
      id: updateId,
      state: "started",
      to_version: manifest.version,
      worker_version: workerVersion
    };
    checkpoint = {
      bookmark,
      cleanupComplete: false,
      configFile: options.configFile,
      name: options.workerName,
      workerVersion
    };
  }

  options.onRecovery?.(checkpoint);
  if (!afterDeployState.pendingUpdate) {
    updateReleaseState(
      source,
      `INSERT INTO update_history (id, from_version, to_version, checkpoint_bookmark, worker_version, state, started_at) VALUES (${quote(update.id)}, ${quote(manifest.version)}, ${quote(manifest.version)}, ${quote(update.checkpoint_bookmark)}, ${quote(update.worker_version)}, 'started', datetime('now'))`
    );
  }
  recordWorkerDeployed();
  if (afterDeployState.phase !== "S3") {
    applyMigrations(source, "normal", { target: "remote" });
    applyMigrations(source, "after-deploy", { target: "remote" });
    checkpoint.cleanupComplete = true;
  }
  updateReleaseState(
    source,
    `UPDATE release_state SET installed_version = ${quote(manifest.version)}, installed_schema_version = ${manifest.schemaVersion}, updated_at = datetime('now') WHERE singleton = 1; UPDATE update_history SET state = 'verified', completed_at = datetime('now') WHERE id = ${quote(update.id)} AND state IN ('started', 'deployed')`
  );
  return {
    phase: afterDeployState.phase,
    repaired: afterDeployState.phase !== "S3",
    workerRecorded: true
  };
}

export function createRecoveryBookmark(source, options = {}) {
  return findString(
    JSON.parse(
      (options.capture ?? capture)(
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
