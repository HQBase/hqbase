import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { withUpdateBuildLock } from "../../../worker/features/updates/build-lock";
import { applyCurrentMigrations } from "./current-migrations";

describe("update build lock", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM app_settings WHERE key LIKE 'update_build_lock:%'").run();
  });

  it("allows only one update to prepare a production trigger at a time", async () => {
    let finishFirst: (() => void) | undefined;
    let firstStarted: (() => void) | undefined;
    const firstReady = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const firstCanFinish = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const first = withUpdateBuildLock(env.DB, "production-trigger", async () => {
      firstStarted?.();
      await firstCanFinish;
      return "first";
    });
    await firstReady;

    await expect(
      withUpdateBuildLock(env.DB, "production-trigger", async () => "second")
    ).rejects.toMatchObject({ code: "UPDATE_IN_PROGRESS", status: 409 });

    finishFirst?.();
    await expect(first).resolves.toBe("first");
    await expect(
      withUpdateBuildLock(env.DB, "production-trigger", async () => "next")
    ).resolves.toBe("next");
  });

  it("does not let an old owner release a replacement lease", async () => {
    let oldStarted: (() => void) | undefined;
    let releaseOld: (() => void) | undefined;
    let replacementStarted: (() => void) | undefined;
    let releaseReplacement: (() => void) | undefined;
    const oldReady = new Promise<void>((resolve) => {
      oldStarted = resolve;
    });
    const oldCanFinish = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const replacementReady = new Promise<void>((resolve) => {
      replacementStarted = resolve;
    });
    const replacementCanFinish = new Promise<void>((resolve) => {
      releaseReplacement = resolve;
    });
    const old = withUpdateBuildLock(
      env.DB,
      "production-trigger",
      async () => {
        oldStarted?.();
        await oldCanFinish;
      },
      new Date("2026-08-22T12:00:00.000Z")
    );
    await oldReady;

    const replacement = withUpdateBuildLock(
      env.DB,
      "production-trigger",
      async () => {
        replacementStarted?.();
        await replacementCanFinish;
      },
      new Date("2026-08-22T12:05:00.000Z")
    );
    await replacementReady;

    releaseOld?.();
    await expect(old).resolves.toBeUndefined();
    await expect(
      withUpdateBuildLock(
        env.DB,
        "production-trigger",
        async () => "third",
        new Date("2026-08-22T12:06:00.000Z")
      )
    ).rejects.toMatchObject({ code: "UPDATE_IN_PROGRESS", status: 409 });

    releaseReplacement?.();
    await expect(replacement).resolves.toBeUndefined();
  });
});
