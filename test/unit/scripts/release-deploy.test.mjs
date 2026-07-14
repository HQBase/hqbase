import { generateKeyPairSync, sign } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareVersions,
  deploySource,
  needsInitialAuthSecret,
  normalizeConfig,
  verifyManifest
} from "../../../scripts/release/deploy.mjs";

describe("Community release deployment", () => {
  it("verifies edition-bound manifests", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const manifest = {
      format: "hqbase-release-v1",
      edition: "community",
      channel: "stable",
      version: "1.2.3",
      artifact: { sha256: "a".repeat(64), size: 1 }
    };
    const payload = Buffer.from(JSON.stringify(manifest)).toString("base64url");
    const envelope = {
      payload,
      signature: sign(null, Buffer.from(payload, "base64url"), privateKey).toString("base64url")
    };
    const encoded = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    expect(verifyManifest(envelope, encoded)).toMatchObject({ version: "1.2.3" });
    expect(() =>
      verifyManifest({ ...envelope, signature: `A${envelope.signature.slice(1)}` }, encoded)
    ).toThrow("signature");
  });
  it("selects only newer semantic releases", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
  });
  it("rebases customer deployment paths onto the verified release source", () => {
    expect(
      normalizeConfig(
        {
          main: "../../../worker/index.ts",
          assets: { directory: "../../../dist", binding: "ASSETS" },
          d1_databases: [{ binding: "DB", migrations_dir: "../../../migrations" }],
          vars: { HQBASE_WORKER_NAME: "customer-worker" }
        },
        "0.1.1"
      )
    ).toMatchObject({
      main: "worker/index.ts",
      assets: { directory: "./dist", binding: "ASSETS" },
      d1_databases: [{ binding: "DB", migrations_dir: "migrations" }],
      vars: { HQBASE_APP_VERSION: "0.1.1", HQBASE_WORKER_NAME: "customer-worker" }
    });
  });
  it("generates a masked auth secret only when the first Workers Build needs it", () => {
    let secretFile;
    deploySource("/customer/repo", {
      workersCi: true,
      attempt: () => ({
        status: 0,
        stdout: "[]",
        stderr: ""
      }),
      randomBytes: () => Buffer.alloc(32, 7),
      run: (command, args, cwd) => {
        expect(command).toBe("pnpm");
        expect(args.slice(0, 3)).toEqual(["exec", "wrangler", "deploy"]);
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
});
