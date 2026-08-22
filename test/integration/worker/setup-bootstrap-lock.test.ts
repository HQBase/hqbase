import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  claimBootstrapLock,
  releaseBootstrapLock,
  renewBootstrapLock
} from "../../../worker/features/setup/bootstrap-lock";
import { applyCurrentMigrations } from "./current-migrations";

describe("setup bootstrap lock", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM app_settings WHERE key = 'setup_bootstrap_lock'").run();
  });

  it("lets only one concurrent setup claim the fresh workspace", async () => {
    const claims = await Promise.allSettled([
      claimBootstrapLock(env.DB),
      claimBootstrapLock(env.DB)
    ]);
    const fulfilled = claims.filter(
      (claim): claim is PromiseFulfilledResult<Awaited<ReturnType<typeof claimBootstrapLock>>> =>
        claim.status === "fulfilled"
    );
    const rejected = claims.filter(
      (claim): claim is PromiseRejectedResult => claim.status === "rejected"
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: "SETUP_IN_PROGRESS", status: 409 });

    const winner = fulfilled[0];
    if (!winner) throw new Error("Expected one bootstrap lock claim to succeed.");
    await releaseBootstrapLock(env.DB, winner.value);
    await expect(claimBootstrapLock(env.DB)).resolves.toBeDefined();
  });

  it("reclaims a lock at the lease boundary without letting its old owner release the new claim", async () => {
    const first = await claimBootstrapLock(env.DB, new Date("2026-08-22T12:00:00.000Z"));
    const replacement = await claimBootstrapLock(env.DB, new Date("2026-08-22T12:05:00.000Z"));

    await releaseBootstrapLock(env.DB, first);
    await expect(
      claimBootstrapLock(env.DB, new Date("2026-08-22T12:06:01.000Z"))
    ).rejects.toMatchObject({ code: "SETUP_IN_PROGRESS", status: 409 });

    await releaseBootstrapLock(env.DB, replacement);
    await expect(
      claimBootstrapLock(env.DB, new Date("2026-08-22T12:06:02.000Z"))
    ).resolves.toBeDefined();
  });

  it("keeps an active bootstrap claim beyond one lease through renewal", async () => {
    const first = await claimBootstrapLock(env.DB, new Date("2026-08-22T12:00:00.000Z"));
    await renewBootstrapLock(env.DB, first, new Date("2026-08-22T12:04:30.000Z"));

    await expect(
      claimBootstrapLock(env.DB, new Date("2026-08-22T12:05:01.000Z"))
    ).rejects.toMatchObject({ code: "SETUP_IN_PROGRESS", status: 409 });

    await renewBootstrapLock(env.DB, first, new Date("2026-08-22T12:09:00.000Z"));
    await expect(
      claimBootstrapLock(env.DB, new Date("2026-08-22T12:10:00.000Z"))
    ).rejects.toMatchObject({ code: "SETUP_IN_PROGRESS", status: 409 });
  });
});
