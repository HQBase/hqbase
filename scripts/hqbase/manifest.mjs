import fs from "node:fs";
import path from "node:path";

import { assertCurrentManifest } from "./lifecycle-manifest.mjs";
import { deploymentsRoot } from "./paths.mjs";

const namePattern = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function assertDeploymentName(name) {
  if (!namePattern.test(name)) {
    throw new Error("Deployment name must be lowercase letters, numbers, and hyphens.");
  }
}

export function deploymentDir(name) {
  assertDeploymentName(name);
  return path.join(deploymentsRoot, name);
}

export function manifestPath(name) {
  return path.join(deploymentDir(name), "manifest.json");
}

export function configPath(name) {
  return path.join(deploymentDir(name), "wrangler.jsonc");
}

export function ensureDeploymentDir(name) {
  const dir = deploymentDir(name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadManifest(name) {
  const file = manifestPath(name);
  if (!fs.existsSync(file)) {
    throw new Error(`No HQBase deployment manifest found for "${name}".`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeManifest(manifest, options = {}) {
  if (options.dryRun) {
    return;
  }
  ensureDeploymentDir(manifest.name);
  const file = manifestPath(manifest.name);
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) {
      fs.unlinkSync(temporary);
    }
  }
}

export function manifestExists(name) {
  return fs.existsSync(manifestPath(name));
}

function deploymentNameFromConfig(configFile) {
  const resolvedConfig = path.resolve(configFile);
  if (path.basename(resolvedConfig) !== "wrangler.jsonc") {
    return null;
  }

  const deploymentDirectory = path.dirname(resolvedConfig);
  if (path.dirname(deploymentDirectory) !== path.resolve(deploymentsRoot)) {
    return null;
  }

  const name = path.basename(deploymentDirectory);
  assertDeploymentName(name);
  return name;
}

export function recordWorkerDeployedForConfig(configFile, workerName, options = {}) {
  const name = deploymentNameFromConfig(configFile);
  if (!name) {
    return null;
  }

  const manifest = (options.loadManifest ?? loadManifest)(name);
  assertCurrentManifest(manifest);
  if (manifest.name !== name) {
    throw new Error(
      `Refusing to record Worker deployment: manifest name "${manifest.name}" does not match deployment "${name}".`
    );
  }
  if (manifest.worker.name !== workerName) {
    throw new Error(
      `Refusing to record Worker deployment: manifest Worker "${manifest.worker.name}" does not match deployed Worker "${workerName}".`
    );
  }
  if (!manifest.worker.deployed) {
    manifest.worker.deployed = true;
    (options.writeManifest ?? writeManifest)(manifest);
  }
  return manifest;
}
