#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, win32 } from "node:path";

const publicKey = "MCowBQYDK2VwAyEARmCVvXVUDzwewmIDAVez9Uyv2K+7ylU6+YhR5iN2WTc=";
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const sha256 = /^[a-f0-9]{64}$/;
const updaterSource =
  /^https:\/\/raw\.githubusercontent\.com\/HQBase\/hqbase\/[a-f0-9]{40}\/scripts\/release\/bootstrap\.mjs$/;
const managedDataUrl = import.meta.url.startsWith("data:");

export async function bootstrap(options = {}) {
  const expectedVersion = options.expectedVersion ?? process.env.HQBASE_EXPECTED_RELEASE_VERSION;
  if (!stableVersion.test(expectedVersion ?? "")) {
    throw new Error("HQBASE_EXPECTED_RELEASE_VERSION must name one stable HQBase release.");
  }
  const fetcher = options.fetcher ?? fetch;
  const manifestFile =
    options.manifestFile ??
    (managedDataUrl ? null : process.env.HQBASE_RELEASE_MANIFEST_FILE?.trim() || null);
  const envelope = manifestFile
    ? JSON.parse(readFileSync(resolve(manifestFile), "utf8"))
    : await fetchJson(
        fetcher,
        `https://github.com/HQBase/hqbase/releases/download/v${expectedVersion}/manifest-${expectedVersion}.json`,
        "Release manifest"
      );
  const manifest = verifyBootstrapManifest(envelope, expectedVersion, options.publicKeyBase64);
  const artifactFile =
    options.artifactFile ??
    (managedDataUrl ? null : process.env.HQBASE_RELEASE_ARTIFACT_FILE?.trim() || null);
  const bytes = artifactFile
    ? readFileSync(resolve(artifactFile))
    : await fetchBytes(fetcher, manifest.artifact.url, "Release artifact");
  if (
    bytes.length !== manifest.artifact.size ||
    createHash("sha256").update(bytes).digest("hex") !== manifest.artifact.sha256
  ) {
    throw new Error("Release artifact integrity check failed.");
  }

  const workspace = mkdtempSync(resolve(tmpdir(), "hqbase-bootstrap-"));
  try {
    const archive = resolve(workspace, "release.tar.gz");
    const verifiedManifest = resolve(workspace, "manifest.json");
    const source = resolve(workspace, "source");
    mkdirSync(source);
    writeFileSync(archive, bytes);
    writeFileSync(verifiedManifest, `${JSON.stringify(envelope)}\n`);
    const run = options.run ?? runCommand;
    const platform = options.platform ?? process.platform;
    const extractor =
      platform === "win32"
        ? win32.resolve(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
        : "tar";
    run(extractor, ["-xzf", archive, "-C", source], { cwd: workspace });
    const candidateEnvironment = {
      ...process.env,
      CI: process.env.CI ?? "true",
      HQBASE_EXPECTED_RELEASE_VERSION: expectedVersion,
      HQBASE_RELEASE_ARTIFACT_FILE: archive,
      HQBASE_RELEASE_MANIFEST_FILE: verifiedManifest
    };
    if (platform === "win32") {
      // The extracted updater uses cross-spawn for safe Windows argv handling. Install its frozen
      // dependencies first through a fixed cmd.exe command, before that module is imported.
      run(
        options.windowsShell ?? process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", "pnpm install --frozen-lockfile"],
        { cwd: source, env: candidateEnvironment }
      );
    }
    run(
      process.execPath,
      [
        resolve(source, "scripts/release/deploy.mjs"),
        "--config",
        resolve(
          options.configFile ??
            (managedDataUrl ? null : process.env.HQBASE_UPDATER_CONFIG_FILE?.trim() || null) ??
            resolve(process.cwd(), "wrangler.jsonc")
        )
      ],
      {
        cwd: source,
        env: candidateEnvironment
      }
    );
    return { version: manifest.version };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

export function verifyBootstrapManifest(envelope, expectedVersion, publicKeyBase64 = publicKey) {
  if (!envelope || typeof envelope.payload !== "string" || typeof envelope.signature !== "string") {
    throw new Error("Release manifest envelope is invalid.");
  }
  const key = createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki"
  });
  const payload = Buffer.from(envelope.payload, "base64url");
  if (!verify(null, payload, key, Buffer.from(envelope.signature, "base64url"))) {
    throw new Error("Release manifest signature is invalid.");
  }
  const manifest = JSON.parse(payload.toString("utf8"));
  if (manifest.version !== expectedVersion) {
    throw new Error(`Expected signed HQBase ${expectedVersion}, received ${manifest.version}.`);
  }
  const canonicalArtifactUrl = `https://github.com/HQBase/hqbase/releases/download/v${expectedVersion}/hqbase-${expectedVersion}.tar.gz`;
  if (
    manifest.format !== "hqbase-release-v1" ||
    manifest.product !== "hqbase" ||
    manifest.channel !== "stable" ||
    manifest.keyId !== "hqbase-release-2026-01" ||
    !stableVersion.test(manifest.version) ||
    !stableVersion.test(manifest.minVersion) ||
    !Number.isInteger(manifest.schemaVersion) ||
    manifest.schemaVersion <= 0 ||
    manifest.artifact?.url !== canonicalArtifactUrl ||
    !sha256.test(manifest.artifact?.sha256) ||
    !Number.isInteger(manifest.artifact?.size) ||
    manifest.artifact.size <= 0 ||
    manifest.updater?.protocol !== 2 ||
    !updaterSource.test(manifest.updater?.sourceUrl) ||
    !sha256.test(manifest.updater?.sha256) ||
    !Number.isInteger(manifest.updater?.size) ||
    manifest.updater.size <= 0
  ) {
    throw new Error("Release manifest is incompatible with the managed updater.");
  }
  return manifest;
}

async function fetchJson(fetcher, url, label) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`${label} download failed (${response.status}).`);
  return response.json();
}

async function fetchBytes(fetcher, url, label) {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`${label} download failed (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

function runCommand(command, args, options) {
  const result = spawnSync(command, args, { ...options, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status ?? "no exit code"}): ${[command, ...args].join(" ")}`
    );
  }
}

if (
  managedDataUrl ||
  (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename))
) {
  const configIndex = process.argv.indexOf("--config");
  if (configIndex >= 0 && !process.argv[configIndex + 1]) {
    throw new Error("--config requires a wrangler.jsonc path.");
  }
  await bootstrap({ configFile: configIndex >= 0 ? process.argv[configIndex + 1] : undefined });
}
