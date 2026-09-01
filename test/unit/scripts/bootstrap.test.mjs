import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { bootstrap, verifyBootstrapManifest } from "../../../scripts/release/bootstrap.mjs";
import { verifyManifest } from "../../../scripts/release/manifest.mjs";

const version = "1.3.3";
const sourceCommit = "a".repeat(40);

function signedRelease(artifact = Buffer.from("signed release")) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const manifest = {
    format: "hqbase-release-v1",
    product: "hqbase",
    channel: "stable",
    version,
    schemaVersion: 3,
    minVersion: "1.0.0",
    publishedAt: "2026-09-01T04:00:00.000Z",
    notes: [],
    notesUrl: `https://github.com/HQBase/hqbase/releases/tag/v${version}`,
    artifact: {
      url: `https://github.com/HQBase/hqbase/releases/download/v${version}/hqbase-${version}.tar.gz`,
      sha256: createHash("sha256").update(artifact).digest("hex"),
      size: artifact.length
    },
    updater: {
      protocol: 2,
      sourceUrl: `https://raw.githubusercontent.com/HQBase/hqbase/${sourceCommit}/scripts/release/bootstrap.mjs`,
      sha256: "b".repeat(64),
      size: 123
    },
    keyId: "hqbase-release-2026-01"
  };
  const payload = Buffer.from(JSON.stringify(manifest)).toString("base64url");
  const envelope = {
    payload,
    signature: sign(null, Buffer.from(payload, "base64url"), privateKey).toString("base64url")
  };
  return {
    artifact,
    envelope,
    manifest,
    publicKeyBase64: publicKey.export({ type: "spki", format: "der" }).toString("base64")
  };
}

describe("signed release bootstrap", () => {
  it("downloads the immutable manifest for the exact expected version", async () => {
    const release = signedRelease();
    const urls = [];
    let deployedConfig;
    await bootstrap({
      expectedVersion: version,
      publicKeyBase64: release.publicKeyBase64,
      fetcher: async (url) => {
        urls.push(String(url));
        return urls.length === 1
          ? new Response(JSON.stringify(release.envelope))
          : new Response(release.artifact);
      },
      run: (command, args) => {
        if (command === process.execPath) deployedConfig = args.at(-1);
      }
    });
    expect(urls).toEqual([
      `https://github.com/HQBase/hqbase/releases/download/v${version}/manifest-${version}.json`,
      release.manifest.artifact.url
    ]);
    expect(deployedConfig).toBe(resolve("wrangler.jsonc"));
  });

  it("passes verified local release files and the exact customer config to the release updater", async () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "hqbase-bootstrap-test-"));
    const release = signedRelease();
    const manifestFile = resolve(workspace, "manifest.json");
    const artifactFile = resolve(workspace, "release.tar.gz");
    const configFile = resolve(workspace, "customer", "wrangler.jsonc");
    writeFileSync(manifestFile, JSON.stringify(release.envelope));
    writeFileSync(artifactFile, release.artifact);
    const commands = [];

    try {
      await expect(
        bootstrap({
          artifactFile,
          configFile,
          expectedVersion: version,
          manifestFile,
          platform: "linux",
          publicKeyBase64: release.publicKeyBase64,
          run: (command, args, options) => {
            commands.push({ command, args, options });
            if (command !== process.execPath) return;
            expect(args.slice(-2)).toEqual(["--config", configFile]);
            expect(options.env.HQBASE_EXPECTED_RELEASE_VERSION).toBe(version);
            expect(existsSync(options.env.HQBASE_RELEASE_ARTIFACT_FILE)).toBe(true);
            expect(
              JSON.parse(readFileSync(options.env.HQBASE_RELEASE_MANIFEST_FILE, "utf8"))
            ).toEqual(release.envelope);
          }
        })
      ).resolves.toEqual({ version });
      expect(commands.map(({ command }) => command)).toEqual(["tar", process.execPath]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("installs frozen dependencies before importing the extracted updater on Windows", async () => {
    const release = signedRelease();
    const commands = [];

    await bootstrap({
      expectedVersion: version,
      fetcher: async (url) =>
        String(url).includes("manifest-")
          ? new Response(JSON.stringify(release.envelope))
          : new Response(release.artifact),
      platform: "win32",
      publicKeyBase64: release.publicKeyBase64,
      run: (command, args, options) => commands.push({ command, args, options }),
      windowsShell: "C:\\Windows\\System32\\cmd.exe"
    });

    expect(commands.map(({ command }) => command)).toEqual([
      "tar",
      "C:\\Windows\\System32\\cmd.exe",
      process.execPath
    ]);
    expect(commands[1]?.args).toEqual(["/d", "/s", "/c", "pnpm install --frozen-lockfile"]);
    expect(commands[1]?.options.cwd).toBe(commands[2]?.options.cwd);
  });

  it("rejects a wrong version and tampered release bytes before it runs commands", async () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "hqbase-bootstrap-test-"));
    const release = signedRelease();
    const manifestFile = resolve(workspace, "manifest.json");
    const artifactFile = resolve(workspace, "release.tar.gz");
    writeFileSync(manifestFile, JSON.stringify(release.envelope));
    writeFileSync(artifactFile, release.artifact);
    let commandCount = 0;
    const options = {
      artifactFile,
      manifestFile,
      publicKeyBase64: release.publicKeyBase64,
      run: () => {
        commandCount += 1;
      }
    };

    try {
      await expect(bootstrap({ ...options, expectedVersion: "1.3.4" })).rejects.toThrow(
        "Expected signed HQBase 1.3.4"
      );
      writeFileSync(artifactFile, "tampered");
      await expect(bootstrap({ ...options, expectedVersion: version })).rejects.toThrow(
        "artifact integrity"
      );
      expect(commandCount).toBe(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("requires signed protocol-2 updater metadata while old deployment verification stays compatible", () => {
    const release = signedRelease();
    expect(
      verifyBootstrapManifest(release.envelope, version, release.publicKeyBase64)
    ).toMatchObject({ updater: { protocol: 2, size: 123 } });
    const invalidSignature = `${release.envelope.signature.startsWith("A") ? "B" : "A"}${release.envelope.signature.slice(1)}`;
    expect(() =>
      verifyBootstrapManifest(
        { ...release.envelope, signature: invalidSignature },
        version,
        release.publicKeyBase64
      )
    ).toThrow("signature");
    expect(verifyManifest(release.envelope, release.publicKeyBase64)).toMatchObject({ version });

    const legacyManifest = { ...release.manifest };
    delete legacyManifest.updater;
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const legacyPayload = Buffer.from(JSON.stringify(legacyManifest)).toString("base64url");
    const legacyEnvelope = {
      payload: legacyPayload,
      signature: sign(null, Buffer.from(legacyPayload, "base64url"), privateKey).toString(
        "base64url"
      )
    };
    const legacyKey = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    expect(verifyManifest(legacyEnvelope, legacyKey)).toMatchObject({ version });
    expect(() => verifyBootstrapManifest(legacyEnvelope, version, legacyKey)).toThrow(
      "managed updater"
    );
  });

  it("packages bootstrap bytes from the exact Git commit named by signed metadata", () => {
    const sourceCommitPlaceholder = ["$", "{sourceCommit}"].join("");
    const source = readFileSync(
      new URL("../../../scripts/release/package.mjs", import.meta.url),
      "utf8"
    );
    expect(source).toContain(
      `["show", \`${sourceCommitPlaceholder}:scripts/release/bootstrap.mjs\`]`
    );
    expect(source).toContain(
      `https://raw.githubusercontent.com/HQBase/hqbase/${sourceCommitPlaceholder}/scripts/release/bootstrap.mjs`
    );
    expect(source).toContain('createHash("sha256").update(updaterBytes).digest("hex")');
    expect(source).toContain("size: updaterBytes.length");
  });
});
