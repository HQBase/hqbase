import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const releaseFiles = ["package.mjs", "notes.mjs", "version.mjs"];
const recoveryUpdaterCommit = "7d67e4ae54fe4deafba41c0b5daab5a34cdfe4f9";
const recoveryUpdaterSha256 = "4f6c7d5c4b57c7211e3db047fec3766792d946b99b1075628d286a6d8b43bffe";
const recoveryUpdaterSize = 6928;
const repositoryRoot = resolve(import.meta.dirname, "../../..");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("release package", () => {
  it("pins the recovery release to the exact 1.3.3 updater commit", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8")
    );
    expect(packageJson.hqbaseRelease.updaterCommit).toBe(recoveryUpdaterCommit);
    expect(packageJson.hqbaseRelease.updaterCommitVersion).toBe("1.3.4");
    const currentUpdater = readFileSync(resolve(repositoryRoot, "scripts/release/bootstrap.mjs"));
    expect(currentUpdater.length).toBe(recoveryUpdaterSize);
    expect(createHash("sha256").update(currentUpdater).digest("hex")).toBe(recoveryUpdaterSha256);
  });

  it("uses the committed updater override for signed source metadata", () => {
    const workspace = mkdtempSync(resolve(tmpdir(), "hqbase-package-test-"));
    const releaseDirectory = resolve(workspace, "scripts/release");
    const oldUpdater = Buffer.from("old signed updater\n");
    const newUpdater = Buffer.from("new release updater\n");

    try {
      mkdirSync(releaseDirectory, { recursive: true });
      git(workspace, "init", "--quiet");
      git(workspace, "config", "user.email", "release-test@hqbase.test");
      git(workspace, "config", "user.name", "HQBase release test");
      writeFileSync(resolve(releaseDirectory, "bootstrap.mjs"), oldUpdater);
      git(workspace, "add", ".");
      git(workspace, "commit", "--quiet", "-m", "old updater");
      const updaterCommit = git(workspace, "rev-parse", "HEAD");

      for (const file of releaseFiles) {
        writeFileSync(
          resolve(releaseDirectory, file),
          readFileSync(new URL(`../../../scripts/release/${file}`, import.meta.url))
        );
      }
      writeFileSync(resolve(releaseDirectory, "bootstrap.mjs"), newUpdater);
      writeFileSync(
        resolve(workspace, "package.json"),
        `${JSON.stringify(
          {
            name: "hqbase",
            version: "1.3.4",
            private: true,
            type: "module",
            hqbaseRelease: {
              minimumVersion: "1.0.0",
              updaterCommit,
              updaterCommitVersion: "1.3.4"
            }
          },
          null,
          2
        )}\n`
      );
      writeFileSync(
        resolve(workspace, "CHANGELOG.md"),
        "# Changelog\n\n## 1.3.4\n\n- Test release.\n"
      );
      git(workspace, "add", ".");
      git(workspace, "commit", "--quiet", "-m", "candidate");

      const { privateKey } = generateKeyPairSync("ed25519");
      execFileSync(process.execPath, [resolve(releaseDirectory, "package.mjs")], {
        cwd: workspace,
        env: {
          ...process.env,
          HQBASE_RELEASE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
        }
      });

      const envelope = JSON.parse(readFileSync(resolve(workspace, "release/stable.json"), "utf8"));
      const manifest = JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8"));
      expect(manifest.updater).toEqual({
        protocol: 2,
        sourceUrl: `https://raw.githubusercontent.com/HQBase/hqbase/${updaterCommit}/scripts/release/bootstrap.mjs`,
        sha256: createHash("sha256").update(oldUpdater).digest("hex"),
        size: oldUpdater.length
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
