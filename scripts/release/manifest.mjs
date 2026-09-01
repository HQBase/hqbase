import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { workerNameFromConfig } from "./worker-deploy.mjs";

const root = resolve(import.meta.dirname, "../..");
const packageVersion = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const publicKey = "MCowBQYDK2VwAyEARmCVvXVUDzwewmIDAVez9Uyv2K+7ylU6+YhR5iN2WTc=";
const stableManifestUrl = "https://github.com/HQBase/hqbase/releases/latest/download/stable.json";

export async function loadVerifiedRelease(options = {}) {
  const fetcher = options.fetcher ?? fetch;
  let envelope;
  if (options.manifestFile) {
    envelope = JSON.parse(readFileSync(resolve(options.manifestFile), "utf8"));
  } else {
    const response = await fetcher(options.manifestUrl ?? stableManifestUrl);
    if (!response.ok) throw new Error(`Release check failed (${response.status}).`);
    envelope = await response.json();
  }
  const manifest = verifyManifest(envelope, options.publicKeyBase64);
  if (options.expectedVersion) {
    if (manifest.version !== options.expectedVersion) {
      throw new Error(
        `Expected signed HQBase ${options.expectedVersion}, received ${manifest.version}.`
      );
    }
  } else if (compareVersions(manifest.version, options.checkedOutVersion ?? packageVersion) < 0) {
    throw new Error(
      `HQBase ${options.checkedOutVersion ?? packageVersion} has not been published as a signed stable release yet.`
    );
  }

  let bytes;
  if (options.artifactFile) {
    bytes = readFileSync(resolve(options.artifactFile));
  } else {
    const artifactResponse = await fetcher(manifest.artifact.url);
    if (!artifactResponse.ok)
      throw new Error(`Release download failed (${artifactResponse.status}).`);
    bytes = Buffer.from(await artifactResponse.arrayBuffer());
  }
  if (
    bytes.length !== manifest.artifact.size ||
    createHash("sha256").update(bytes).digest("hex") !== manifest.artifact.sha256
  ) {
    throw new Error("Release artifact integrity check failed.");
  }
  return { bytes, manifest };
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
  ) {
    throw new Error("Release manifest signature is invalid.");
  }
  const manifest = JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8"));
  // Signed releases before the managed updater bridge do not have updater metadata.
  const updaterIsValid =
    manifest.updater === undefined ||
    (manifest.updater?.protocol === 2 &&
      /^https:\/\/raw\.githubusercontent\.com\/HQBase\/hqbase\/[a-f0-9]{40}\/scripts\/release\/bootstrap\.mjs$/.test(
        manifest.updater?.sourceUrl
      ) &&
      /^[a-f0-9]{64}$/.test(manifest.updater?.sha256) &&
      Number.isInteger(manifest.updater?.size) &&
      manifest.updater.size > 0);
  if (
    manifest.format !== "hqbase-release-v1" ||
    manifest.product !== "hqbase" ||
    manifest.channel !== "stable" ||
    !/^\d+\.\d+\.\d+/.test(manifest.version) ||
    !/^\d+\.\d+\.\d+/.test(manifest.minVersion) ||
    (manifest.notes !== undefined &&
      (!Array.isArray(manifest.notes) ||
        manifest.notes.length > 100 ||
        manifest.notes.some(
          (note) => typeof note !== "string" || note.length < 1 || note.length > 2_000
        ))) ||
    !/^[a-f0-9]{64}$/.test(manifest.artifact?.sha256) ||
    !Number.isInteger(manifest.artifact?.size) ||
    manifest.artifact.size <= 0 ||
    !updaterIsValid
  ) {
    throw new Error("Release manifest is incompatible.");
  }
  return { ...manifest, notes: manifest.notes ?? [] };
}

export function compareVersions(left, right) {
  const a = left.split("-")[0].split(".").map(Number);
  const b = right.split("-")[0].split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function normalizeConfig(config, version, artifactSha256, releaseConfig = config) {
  const normalized = {
    ...config,
    $schema: "./node_modules/wrangler/config-schema.json",
    main: "worker/index.ts",
    compatibility_flags: [
      ...new Set([...(config.compatibility_flags ?? []), "global_fetch_strictly_public"])
    ],
    assets: {
      ...config.assets,
      ...releaseConfig.assets,
      directory: "./dist"
    },
    observability: {
      ...config.observability,
      enabled: true,
      logs: {
        ...config.observability?.logs,
        enabled: true,
        invocation_logs: false
      }
    },
    vars: {
      ...config.vars,
      HQBASE_APP_VERSION: version,
      ...(artifactSha256 ? { HQBASE_RELEASE_ARTIFACT_SHA256: artifactSha256 } : {}),
      HQBASE_WORKER_NAME: workerNameFromConfig(config)
    },
    d1_databases: config.d1_databases?.map((binding) => {
      const normalized = { ...binding, migrations_dir: "migrations" };
      delete normalized.migrations_pattern;
      return normalized;
    })
  };

  if (releaseConfig.durable_objects) {
    normalized.durable_objects = releaseConfig.durable_objects;
  } else {
    delete normalized.durable_objects;
  }
  if (releaseConfig.migrations) {
    normalized.migrations = releaseConfig.migrations;
  } else {
    delete normalized.migrations;
  }
  return normalized;
}

export function hqbaseReleaseTag(version, artifactSha256) {
  if (!/^\d+\.\d+\.\d+/.test(version) || !/^[a-f0-9]{64}$/.test(artifactSha256)) {
    throw new Error("HQBase release identity is invalid.");
  }
  return `hqbase:${version}:${artifactSha256}`;
}
