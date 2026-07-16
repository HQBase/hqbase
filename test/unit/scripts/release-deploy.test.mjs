import { generateKeyPairSync, sign } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  inspectActiveCommunityRelease,
  parseActiveCommunityRelease
} from "../../../scripts/release/active-version.mjs";
import {
  communityReleaseTag,
  compareVersions,
  deploySource,
  needsInitialAuthSecret,
  normalizeConfig,
  verifyManifest,
  workerNameFromConfig
} from "../../../scripts/release/deploy.mjs";

describe("Community release deployment", () => {
  it("verifies edition-bound manifests", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const manifest = {
      format: "hqbase-release-v1",
      edition: "community",
      channel: "stable",
      version: "1.2.3",
      minVersion: "1.2.0",
      artifact: { sha256: "a".repeat(64), size: 1 }
    };
    const payload = Buffer.from(JSON.stringify(manifest)).toString("base64url");
    const envelope = {
      payload,
      signature: sign(null, Buffer.from(payload, "base64url"), privateKey).toString("base64url")
    };
    const encoded = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    expect(verifyManifest(envelope, encoded)).toMatchObject({ version: "1.2.3" });
    const invalidSignature = `${envelope.signature.startsWith("A") ? "B" : "A"}${envelope.signature.slice(1)}`;
    expect(() => verifyManifest({ ...envelope, signature: invalidSignature }, encoded)).toThrow(
      "signature"
    );
  });
  it("selects only newer semantic releases", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  });
  it("rebases customer deployment paths onto the verified release source", () => {
    expect(
      normalizeConfig(
        {
          name: "customer-worker",
          main: "../../../worker/index.ts",
          compatibility_flags: ["nodejs_compat"],
          assets: { directory: "../../../dist", binding: "ASSETS" },
          d1_databases: [{ binding: "DB", migrations_dir: "../../../migrations" }],
          vars: { HQBASE_WORKER_NAME: "customer-worker" }
        },
        "0.1.1",
        "b".repeat(64)
      )
    ).toMatchObject({
      main: "worker/index.ts",
      compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
      assets: { directory: "./dist", binding: "ASSETS" },
      d1_databases: [{ binding: "DB", migrations_dir: "migrations" }],
      vars: {
        HQBASE_APP_VERSION: "0.1.1",
        HQBASE_RELEASE_ARTIFACT_SHA256: "b".repeat(64),
        HQBASE_WORKER_NAME: "customer-worker"
      }
    });
  });
  it("creates an immutable active-version tag from the signed Community artifact", () => {
    expect(communityReleaseTag("0.1.5", "a".repeat(64))).toBe(
      `hqbase-community:0.1.5:${"a".repeat(64)}`
    );
    expect(() => communityReleaseTag("0.1.5", "not-a-digest")).toThrow("identity");
  });
  it("reads the installed release from the active Worker instead of the source checkout", () => {
    expect(
      parseActiveCommunityRelease(
        { versions: [{ version_id: "active-version", percentage: 100 }] },
        {
          id: "active-version",
          annotations: { "workers/tag": `hqbase-community:0.1.14:${"a".repeat(64)}` },
          resources: {
            bindings: [{ name: "HQBASE_APP_VERSION", type: "plain_text", text: "0.1.14" }]
          }
        }
      )
    ).toEqual({
      versionId: "active-version",
      version: "0.1.14",
      tag: `hqbase-community:0.1.14:${"a".repeat(64)}`
    });
    expect(() =>
      parseActiveCommunityRelease(
        { versions: [{ version_id: "one", percentage: 50 }] },
        { id: "one", resources: { bindings: [] } }
      )
    ).toThrow("one active 100-percent version");
  });
  it("distinguishes a fresh Worker from an existing active release", () => {
    expect(
      inspectActiveCommunityRelease("/release", "customer-worker", {
        attempt: () => ({
          status: 1,
          stdout: "",
          stderr:
            "This Worker does not exist on your account. [code: 10007] If this is a new Worker, deploy it."
        })
      })
    ).toBeNull();
    expect(
      inspectActiveCommunityRelease("/release", "customer-worker", {
        attempt: () => ({
          status: 0,
          stdout: JSON.stringify({
            versions: [{ version_id: "active-version", percentage: 100 }]
          }),
          stderr: ""
        }),
        capture: () =>
          JSON.stringify({
            id: "active-version",
            resources: {
              bindings: [{ name: "HQBASE_APP_VERSION", type: "plain_text", text: "0.1.14" }]
            }
          })
      })
    ).toMatchObject({ versionId: "active-version", version: "0.1.14" });
  });
  it("uses the configured Worker name as the runtime automation identity", () => {
    expect(workerNameFromConfig({ name: "hqbase-deeptake-test" })).toBe("hqbase-deeptake-test");
    expect(() => workerNameFromConfig({ name: "" })).toThrow("deployed Worker name");
  });
  it("generates a masked auth secret only when the first Workers Build needs it", () => {
    let secretFile;
    deploySource("/customer/repo", {
      workersCi: true,
      workerName: "hqbase-deeptake-test",
      attempt: () => ({
        status: 0,
        stdout: "[]",
        stderr: ""
      }),
      randomBytes: () => Buffer.alloc(32, 7),
      randomUUID: () => "00000000-0000-4000-8000-000000000123",
      releaseTag: `hqbase-community:0.1.15:${"a".repeat(64)}`,
      run: (command, args, cwd) => {
        expect(command).toBe("pnpm");
        expect(args.slice(0, 3)).toEqual(["exec", "wrangler", "deploy"]);
        expect(args).toContain("HQBASE_WORKER_NAME:hqbase-deeptake-test");
        expect(args).toContain("HQBASE_INSTALLATION_ID:00000000-0000-4000-8000-000000000123");
        expect(args).toContain("--keep-vars");
        expect(args).toContain(`hqbase-community:0.1.15:${"a".repeat(64)}`);
        expect(args.at(-2)).toBe("--secrets-file");
        expect(cwd).toBe("/customer/repo");
        secretFile = args.at(-1);
        expect(statSync(secretFile).mode & 0o777).toBe(0o600);
        expect(JSON.parse(readFileSync(secretFile, "utf8"))).toEqual({
          BETTER_AUTH_SECRET: Buffer.alloc(32, 7).toString("base64url")
        });
      }
    });
    expect(existsSync(secretFile)).toBe(false);
  });
  it("preserves an existing auth secret and does not mask unrelated deploy failures", () => {
    let deployCalls = 0;
    deploySource("/customer/repo", {
      workersCi: true,
      workerName: "hqbase-deeptake-test",
      attempt: () => ({
        status: 0,
        stdout: JSON.stringify([{ name: "BETTER_AUTH_SECRET", type: "secret_text" }]),
        stderr: ""
      }),
      run: () => {
        deployCalls += 1;
      }
    });
    expect(deployCalls).toBe(1);
    expect(
      needsInitialAuthSecret(
        {
          status: 1,
          stdout: "",
          stderr:
            'Worker "hqbase" not found.\n\nIf this is a new Worker, run `wrangler deploy` first.'
        },
        "BETTER_AUTH_SECRET"
      )
    ).toBe(true);
    expect(() =>
      needsInitialAuthSecret(
        { status: 1, stdout: "", stderr: "Cloudflare API authentication failed" },
        "BETTER_AUTH_SECRET"
      )
    ).toThrow("wrangler secret list exited");
  });
  it("keeps the generated secret out of Deploy to Cloudflare form metadata", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    expect(packageJson.cloudflare.bindings).not.toHaveProperty("BETTER_AUTH_SECRET");
    expect(readFileSync(".env.example", "utf8")).not.toMatch(/^BETTER_AUTH_SECRET=/m);
  });
  it("routes browser navigations to API endpoints before the SPA fallback", () => {
    const wranglerConfig = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
    expect(wranglerConfig.assets).toMatchObject({
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*"]
    });
  });
  it("keeps the deploy configuration version aligned with the package release", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const wranglerConfig = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
    expect(wranglerConfig.vars.HQBASE_APP_VERSION).toBe(packageJson.version);
  });
});
