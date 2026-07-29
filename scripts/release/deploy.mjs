#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

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
  if (process.env.HQBASE_FORCE_SOURCE_DEPLOY === "1") return sourceDeploy(root);
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
      applyMigrations(source);
      deploySource(source, { releaseTag });
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
    recovery = { bookmark, workerVersion, name: config.name };
    applyMigrations(source);
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

function sourceDeploy(cwd) {
  run("pnpm", ["build"], cwd);
  run("pnpm", ["db:migrate:remote"], cwd);
  deploySource(cwd);
  run("pnpm", ["hqbase", "postdeploy"], cwd);
}

function applyMigrations(cwd) {
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
    cwd
  );
}

function reportRecovery(recovery) {
  console.error(
    `D1 recovery: pnpm exec wrangler d1 time-travel restore DB --bookmark ${recovery.bookmark} --config wrangler.jsonc`
  );
  console.error(
    `Worker recovery: pnpm exec wrangler versions deploy ${recovery.workerVersion}@100% --name ${recovery.name} --config wrangler.jsonc`
  );
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
