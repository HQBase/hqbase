import { generateKeyPairSync, sign } from "node:crypto";
import { compareVersions, getUpdateStatus, triggerUpdate } from "@worker/features/updates/service";
import type { WorkerEnv } from "@worker/lib/env";
import { describe, expect, it, vi } from "vitest";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const payload = Buffer.from(
  JSON.stringify({
    format: "hqbase-release-v1",
    product: "hqbase",
    channel: "stable",
    version: "0.1.0",
    schemaVersion: 2,
    minVersion: "0.0.1",
    publishedAt: "2026-07-12T00:00:00.000Z",
    notesUrl: "https://github.com/HQBase/hqbase/releases/tag/v0.1.0",
    artifact: {
      url: "https://github.com/HQBase/hqbase/releases/download/v0.1.0/hqbase-0.1.0.tar.gz",
      sha256: "0".repeat(64),
      size: 0
    },
    keyId: "hqbase-release-2026-01"
  })
).toString("base64url");
const envelope = {
  payload,
  signature: sign(null, Buffer.from(payload, "base64url"), privateKey).toString("base64url")
};

describe("HQBase updates", () => {
  it("verifies signed manifests", async () => {
    const status = await getUpdateStatus(
      { HQBASE_RELEASE_PUBLIC_KEY: publicKeyBase64 } as WorkerEnv,
      async () => Response.json(envelope)
    );
    expect(status).toMatchObject({
      product: "hqbase",
      installedVersion: "0.1.1",
      available: false,
      compatible: true
    });
    expect(compareVersions("0.2.0", "0.1.9")).toBeGreaterThan(0);
  });
  it("rejects a tampered manifest", async () => {
    const replacement = envelope.signature.startsWith("A") ? "B" : "A";
    await expect(
      getUpdateStatus({ HQBASE_RELEASE_PUBLIC_KEY: publicKeyBase64 } as WorkerEnv, async () =>
        Response.json({ ...envelope, signature: `${replacement}${envelope.signature.slice(1)}` })
      )
    ).rejects.toThrow("signature");
  });
  it("triggers the production Workers Build", async () => {
    const fetcher = cloudflareUpdateFetcher();
    await expect(
      triggerUpdate(
        updateEnvironment(),
        "temporary-token-that-is-long-enough",
        "0.1.0",
        fetcher as typeof fetch
      )
    ).resolves.toEqual({ buildId: "build-id", status: "queued" });
    const pinRequests = fetcher.mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith("/environment_variables") && init?.method === "PATCH"
    );
    expect(pinRequests.map(([, init]) => init?.body)).toEqual([
      JSON.stringify({ HQBASE_EXPECTED_RELEASE_VERSION: { is_secret: false, value: "0.1.0" } })
    ]);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });
  it("rejects an overlapping update before it can replace the shared release pin", async () => {
    let firstPinStarted: (() => void) | undefined;
    let releaseFirstPin: (() => void) | undefined;
    const firstPinReady = new Promise<void>((resolve) => {
      firstPinStarted = resolve;
    });
    const firstPinCanFinish = new Promise<void>((resolve) => {
      releaseFirstPin = resolve;
    });
    const environment = updateEnvironment();
    const firstFetcher = cloudflareUpdateFetcher({
      beforeFirstPin: async () => {
        firstPinStarted?.();
        await firstPinCanFinish;
      }
    });
    const first = triggerUpdate(
      environment,
      "temporary-token-that-is-long-enough",
      "0.1.0",
      firstFetcher as typeof fetch
    );
    await firstPinReady;
    const secondFetcher = cloudflareUpdateFetcher();

    try {
      await expect(
        triggerUpdate(
          environment,
          "temporary-token-that-is-long-enough",
          "0.1.0",
          secondFetcher as typeof fetch
        )
      ).rejects.toMatchObject({ code: "UPDATE_IN_PROGRESS", status: 409 });
      expect(
        secondFetcher.mock.calls.some(
          ([input, init]) =>
            String(input).endsWith("/environment_variables") && init?.method === "PATCH"
        )
      ).toBe(false);
    } finally {
      releaseFirstPin?.();
    }
    await expect(first).resolves.toEqual({ buildId: "build-id", status: "queued" });
  });
  it("times out Cloudflare work before the update-build lease can expire", async () => {
    const originalTimeout = AbortSignal.timeout;
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((delay) =>
        delay === 30_000 ? controller.signal : originalTimeout(delay)
      );
    const baseFetcher = cloudflareUpdateFetcher();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/environment_variables") && !init?.method) {
        const signal = init?.signal;
        expect(signal).toBe(controller.signal);
        controller.abort(new DOMException("Timed out", "TimeoutError"));
        throw signal?.reason;
      }
      return baseFetcher(input, init);
    });
    const environment = updateEnvironment();

    try {
      await expect(
        triggerUpdate(
          environment,
          "temporary-token-that-is-long-enough",
          "0.1.0",
          fetcher as typeof fetch
        )
      ).rejects.toMatchObject({ code: "UPDATE_CLOUDFLARE_TIMEOUT", status: 504 });
    } finally {
      timeout.mockRestore();
    }

    await expect(
      triggerUpdate(
        environment,
        "temporary-token-that-is-long-enough",
        "0.1.0",
        cloudflareUpdateFetcher() as typeof fetch
      )
    ).resolves.toEqual({ buildId: "build-id", status: "queued" });
  });
  it("rejects a custom-source production trigger", async () => {
    const fetcher = cloudflareUpdateFetcher({ deployCommand: "npx wrangler deploy" });

    await expect(
      triggerUpdate(
        updateEnvironment(),
        "temporary-token-that-is-long-enough",
        "0.1.0",
        fetcher as typeof fetch
      )
    ).rejects.toThrow("custom-source deployment process");
    expect(
      fetcher.mock.calls.some(
        ([input, init]) => String(input).endsWith("/builds") && init?.method === "POST"
      )
    ).toBe(false);
  });
  it("rejects a production trigger outside the repository root", async () => {
    const fetcher = cloudflareUpdateFetcher({ rootDirectory: "packages/hqbase" });

    await expect(
      triggerUpdate(
        updateEnvironment(),
        "temporary-token-that-is-long-enough",
        "0.1.0",
        fetcher as typeof fetch
      )
    ).rejects.toThrow("repository-root Workers Builds trigger");
    expect(
      fetcher.mock.calls.some(
        ([input, init]) => String(input).endsWith("/builds") && init?.method === "POST"
      )
    ).toBe(false);
  });
  it("rejects explicit source-deploy mode", async () => {
    const fetcher = cloudflareUpdateFetcher({
      variables: {
        HQBASE_FORCE_SOURCE_DEPLOY: { is_secret: false, value: "1" }
      }
    });

    await expect(
      triggerUpdate(
        updateEnvironment(),
        "temporary-token-that-is-long-enough",
        "0.1.0",
        fetcher as typeof fetch
      )
    ).rejects.toThrow("uses custom source");
    expect(
      fetcher.mock.calls.some(
        ([input, init]) => String(input).endsWith("/builds") && init?.method === "POST"
      )
    ).toBe(false);
  });
  it("rejects a secret release pin", async () => {
    const fetcher = cloudflareUpdateFetcher({
      variables: {
        HQBASE_EXPECTED_RELEASE_VERSION: { is_secret: true }
      }
    });

    await expect(
      triggerUpdate(
        updateEnvironment(),
        "temporary-token-that-is-long-enough",
        "0.1.0",
        fetcher as typeof fetch
      )
    ).rejects.toThrow("plain build variable");
    expect(
      fetcher.mock.calls.some(
        ([input, init]) => String(input).endsWith("/builds") && init?.method === "POST"
      )
    ).toBe(false);
  });
  it("rejects a trigger that does not include main", async () => {
    const fetcher = cloudflareUpdateFetcher({ branchIncludes: ["production"] });

    await expect(
      triggerUpdate(
        updateEnvironment(),
        "temporary-token-that-is-long-enough",
        "0.1.0",
        fetcher as typeof fetch
      )
    ).rejects.toThrow("Connect this Worker to Workers Builds");
    expect(
      fetcher.mock.calls.some(
        ([input, init]) => String(input).endsWith("/builds") && init?.method === "POST"
      )
    ).toBe(false);
  });
  it("requires the build to use the release reviewed by the user", async () => {
    await expect(
      triggerUpdate(
        updateEnvironment(),
        "temporary-token-that-is-long-enough",
        "0.2.0",
        (async () => Response.json(envelope)) as typeof fetch
      )
    ).rejects.toThrow("changed after you reviewed it");
  });
  it("restores the previous release pin when the build does not start", async () => {
    const fetcher = cloudflareUpdateFetcher({
      buildFails: true,
      variables: {
        HQBASE_EXPECTED_RELEASE_VERSION: { is_secret: false, value: "0.0.8" }
      }
    });

    await expect(
      triggerUpdate(
        updateEnvironment(),
        "temporary-token-that-is-long-enough",
        "0.1.0",
        fetcher as typeof fetch
      )
    ).rejects.toThrow("Build could not start");

    const pinRequests = fetcher.mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith("/environment_variables") && init?.method === "PATCH"
    );
    expect(pinRequests.map(([, init]) => init?.body)).toEqual([
      JSON.stringify({ HQBASE_EXPECTED_RELEASE_VERSION: { is_secret: false, value: "0.1.0" } }),
      JSON.stringify({ HQBASE_EXPECTED_RELEASE_VERSION: { is_secret: false, value: "0.0.8" } })
    ]);
  });
  it("removes a new release pin when the build does not start", async () => {
    const fetcher = cloudflareUpdateFetcher({ buildFails: true });

    await expect(
      triggerUpdate(
        updateEnvironment(),
        "temporary-token-that-is-long-enough",
        "0.1.0",
        fetcher as typeof fetch
      )
    ).rejects.toThrow("Build could not start");
    expect(
      fetcher.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/environment_variables/HQBASE_EXPECTED_RELEASE_VERSION") &&
          init?.method === "DELETE"
      )
    ).toBe(true);
  });
  it("preserves the build error when release pin rollback fails", async () => {
    const fetcher = cloudflareUpdateFetcher({
      buildFails: true,
      rollbackFails: true,
      variables: {
        HQBASE_EXPECTED_RELEASE_VERSION: { is_secret: false, value: "0.0.8" }
      }
    });

    await expect(
      triggerUpdate(
        updateEnvironment(),
        "temporary-token-that-is-long-enough",
        "0.1.0",
        fetcher as typeof fetch
      )
    ).rejects.toThrow("Build could not start");
  });
});

function updateEnvironment(): WorkerEnv {
  const raw = vi.fn().mockResolvedValue([[JSON.stringify("mail.example.com")]]);
  let lockValue: string | null = null;
  const db = {
    prepare: vi.fn((query: string) => ({
      bind: vi.fn((...values: unknown[]) => ({
        first: vi.fn(async () => {
          if (!query.includes("INSERT INTO app_settings")) return null;
          if (lockValue) return null;
          lockValue = String(values[1]);
          return { value_json: lockValue };
        }),
        raw,
        run: vi.fn(async () => {
          if (query.startsWith("DELETE FROM app_settings") && values[1] === lockValue) {
            lockValue = null;
          }
          return { success: true };
        })
      }))
    }))
  } as unknown as D1Database;
  return {
    DB: db,
    HQBASE_APP_VERSION: "0.0.9",
    HQBASE_RELEASE_PUBLIC_KEY: publicKeyBase64,
    HQBASE_WORKER_NAME: "hqbase"
  } as WorkerEnv;
}

function cloudflareUpdateFetcher(
  options: {
    beforeFirstPin?: () => Promise<void>;
    branchIncludes?: string[];
    buildFails?: boolean;
    deployCommand?: string;
    rollbackFails?: boolean;
    rootDirectory?: string;
    variables?: Record<string, { is_secret: boolean; value?: string | null }>;
  } = {}
) {
  let pinPatches = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("github.com/HQBase/hqbase/releases")) return Response.json(envelope);
    if (url.includes("/zones?")) {
      return Response.json({
        success: true,
        result: [{ name: "example.com", account: { id: "account" } }]
      });
    }
    if (url.endsWith("/workers/scripts")) {
      return Response.json({ success: true, result: [{ id: "hqbase", tag: "worker-tag" }] });
    }
    if (url.endsWith("/triggers")) {
      return Response.json({
        success: true,
        result: [
          {
            id: "trigger",
            branch_includes: options.branchIncludes ?? ["main"],
            deploy_command: options.deployCommand ?? "pnpm deploy",
            root_directory: options.rootDirectory ?? "/"
          }
        ]
      });
    }
    if (url.endsWith("/environment_variables")) {
      if (init?.method === "PATCH") pinPatches += 1;
      if (pinPatches === 1) await options.beforeFirstPin?.();
      if (options.rollbackFails && pinPatches > 1) {
        return Response.json(
          { success: false, errors: [{ message: "Pin rollback failed." }] },
          { status: 502 }
        );
      }
      return Response.json({
        success: true,
        result: init?.method === "PATCH" ? {} : (options.variables ?? {})
      });
    }
    if (url.endsWith("/builds") && options.buildFails) {
      return Response.json(
        { success: false, errors: [{ message: "Build could not start." }] },
        { status: 502 }
      );
    }
    return Response.json({
      success: true,
      result: { build_uuid: "build-id", status: "queued" }
    });
  });
}
