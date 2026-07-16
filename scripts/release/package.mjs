#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, sign } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { hash as blake3 } from "blake3-wasm";
import { assertCommunityUpgradeCompatibility } from "./community-upgrade.mjs";

const root = resolve(import.meta.dirname, "../..");
const edition = "pro";
const schemaVersion = 11;
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = process.env.HQBASE_RELEASE_VERSION ?? packageJson.version;
const minVersion = process.env.HQBASE_MIN_VERSION || packageJson.hqbaseRelease?.minimumVersion;
const privateKeyValue = process.env.HQBASE_RELEASE_PRIVATE_KEY_FILE
  ? readFileSync(process.env.HQBASE_RELEASE_PRIVATE_KEY_FILE, "utf8")
  : process.env.HQBASE_RELEASE_PRIVATE_KEY;
if (!privateKeyValue) throw new Error("HQBASE_RELEASE_PRIVATE_KEY is required.");
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
  throw new Error("Release version must be semantic.");
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(minVersion ?? ""))
  throw new Error("Minimum release version must be semantic.");

const output = resolve(root, "release");
mkdirSync(output, { recursive: true });
const workerBuild = resolve(output, "worker-build");
rmSync(workerBuild, { force: true, recursive: true });
execFileSync(resolve(root, "node_modules/.bin/vite"), ["build"], { cwd: root, stdio: "inherit" });
execFileSync(
  resolve(root, "node_modules/.bin/wrangler"),
  ["versions", "upload", "--dry-run", "--outdir", workerBuild],
  {
    cwd: root,
    env: { ...process.env, WRANGLER_LOG_PATH: resolve(output, "wrangler.log") },
    stdio: "inherit"
  }
);
const tarFile = resolve(output, `${edition}-${version}.tar`);
const artifactFile = `${tarFile}.gz`;
execFileSync("git", ["archive", "--format=tar", "--output", tarFile, "HEAD"], { cwd: root });
writeFileSync(artifactFile, gzipSync(readFileSync(tarFile), { level: 9 }));
rmSync(tarFile);
const bytes = readFileSync(artifactFile);
const deploymentArtifactFile = resolve(output, `${edition}-${version}.worker.json`);
const mainFile = resolve(workerBuild, "index.js");
const mainBytes = readFileSync(mainFile);
const assets = files(resolve(root, "dist")).map((path) => {
  const contents = readFileSync(path);
  const extension = extname(path).slice(1);
  return {
    path: `/${relative(resolve(root, "dist"), path).replaceAll("\\", "/")}`,
    hash: blake3(contents.toString("base64") + extension)
      .toString("hex")
      .slice(0, 32),
    size: contents.length,
    contentType: contentType(path),
    contentBase64: contents.toString("base64")
  };
});
const migrations = files(resolve(root, "migrations"))
  .filter((path) => /\/00(?:0[2-9]|1[0-9])_.*\.sql$/.test(path))
  .sort()
  .map((path) => {
    const sql = readFileSync(path, "utf8");
    return {
      name: `pro/${relative(resolve(root, "migrations"), path).replaceAll("\\", "/")}`,
      sha256: createHash("sha256").update(sql).digest("hex"),
      sql
    };
  });
writeFileSync(
  deploymentArtifactFile,
  `${JSON.stringify({
    format: "hqbase-worker-bundle-v1",
    edition,
    version,
    schemaVersion,
    compatibilityDate: "2026-07-11",
    compatibilityFlags: ["nodejs_compat"],
    communityUpgrade: assertCommunityUpgradeCompatibility(schemaVersion),
    main: {
      name: "index.js",
      sha256: createHash("sha256").update(mainBytes).digest("hex"),
      contentBase64: mainBytes.toString("base64")
    },
    assets,
    migrations
  })}\n`
);
const deploymentBytes = readFileSync(deploymentArtifactFile);
const manifest = {
  format: "hqbase-release-v1",
  edition,
  channel: "stable",
  version,
  schemaVersion,
  minVersion,
  publishedAt: new Date().toISOString(),
  notesUrl: "https://github.com/HQBase/hqbase-pro-deploy/releases",
  artifact: {
    url: `https://billing.hqbase.io/v1/releases/${edition}/${version}/artifact`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: statSync(artifactFile).size
  },
  deploymentArtifact: {
    url: `https://billing.hqbase.io/v1/releases/${edition}/${version}/deployment-artifact`,
    sha256: createHash("sha256").update(deploymentBytes).digest("hex"),
    size: deploymentBytes.length
  },
  keyId: "hqbase-release-2026-01"
};
const payload = Buffer.from(JSON.stringify(manifest)).toString("base64url");
const signature = sign(
  null,
  Buffer.from(payload, "base64url"),
  createPrivateKey(privateKeyValue)
).toString("base64url");
writeFileSync(resolve(output, "stable.json"), `${JSON.stringify({ payload, signature })}\n`);
console.log(
  JSON.stringify({
    edition,
    version,
    artifactFile,
    deploymentArtifactFile,
    manifestFile: resolve(output, "stable.json")
  })
);

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function contentType(path) {
  const extension = extname(path).toLowerCase();
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".ico": "image/x-icon",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2"
    }[extension] ?? "application/octet-stream"
  );
}
