import fs from "node:fs";
import path from "node:path";

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

export function secretsPath(name) {
  return path.join(deploymentDir(name), "secrets.json");
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
  fs.writeFileSync(manifestPath(manifest.name), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function manifestExists(name) {
  return fs.existsSync(manifestPath(name));
}
