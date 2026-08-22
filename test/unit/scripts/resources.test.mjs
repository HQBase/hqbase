import { describe, expect, it } from "vitest";

import { createManifest } from "../../../scripts/hqbase/install.mjs";
import { provisionResources } from "../../../scripts/hqbase/provision.mjs";
import { prepareManifest, resolveCloudflareAccount } from "../../../scripts/hqbase/resources.mjs";

const accountId = "a".repeat(32);
const d1Id = "11111111-1111-4111-8111-111111111111";
const primaryQueueId = "1".repeat(32);
const deadLetterQueueId = "2".repeat(32);

function manifest() {
  const value = createManifest("recovery", {});
  value.accountId = accountId;
  return value;
}

function markCreated(value, completed) {
  const resources = [value.d1, value.r2, value.queue.primary, value.queue.deadLetter];
  for (const resource of resources.slice(0, completed)) {
    resource.ownership = "created";
  }
  if (completed >= 1) {
    value.d1.id = d1Id;
  }
  if (completed >= 3) {
    value.queue.primary.id = primaryQueueId;
  }
  if (completed >= 4) {
    value.queue.deadLetter.id = deadLetterQueueId;
  }
  return value;
}

function cloudflareRunner(overrides = {}) {
  const calls = [];
  const runCommand = (_command, args) => {
    const wranglerArgs = args.slice(2);
    calls.push(wranglerArgs);
    const operation = wranglerArgs.slice(0, 2).join(" ");

    if (operation === "d1 create") {
      return `database_id = "${d1Id}"`;
    }
    if (operation === "d1 list") {
      return JSON.stringify(
        [{ name: overrides.d1Name ?? "hqbase-recovery", uuid: d1Id }].filter(
          () => !overrides.missingD1
        )
      );
    }
    if (wranglerArgs.slice(0, 3).join(" ") === "r2 bucket create") {
      return "";
    }
    if (wranglerArgs.slice(0, 3).join(" ") === "r2 bucket info") {
      return JSON.stringify({ name: overrides.r2Name ?? "hqbase-recovery-mail" });
    }
    if (operation === "queues create") {
      return "";
    }
    if (operation === "queues info") {
      const name = wranglerArgs[2];
      const expectedId = name.endsWith("-dlq") ? deadLetterQueueId : primaryQueueId;
      const id = overrides.queueId ?? expectedId;
      return `Queue Name: ${overrides.queueName ?? name}\nQueue ID: ${id}\n`;
    }
    throw new Error(`Unexpected Wrangler operation: ${wranglerArgs.join(" ")}`);
  };
  return { calls, runCommand };
}

describe("operator resource recovery", () => {
  it.each([
    0, 1, 2, 3, 4
  ])("resumes after %i completed provisioning steps without recreating them", (completed) => {
    const current = markCreated(manifest(), completed);
    const cloudflare = cloudflareRunner();
    const checkpoints = [];

    prepareManifest(current, accountId, { runCommand: cloudflare.runCommand });
    provisionResources(current, {
      checkpoint: (next) => checkpoints.push(structuredClone(next)),
      runCommand: cloudflare.runCommand
    });

    const creates = cloudflare.calls.filter((args) => args.includes("create"));
    expect(creates).toHaveLength(4 - completed);
    expect(checkpoints).toHaveLength((4 - completed) * 2);
    expect(current.d1).toMatchObject({ id: d1Id, ownership: "created" });
    expect(current.r2.ownership).toBe("created");
    expect(current.queue.primary).toMatchObject({
      id: primaryQueueId,
      ownership: "created"
    });
    expect(current.queue.deadLetter).toMatchObject({
      id: deadLetterQueueId,
      ownership: "created"
    });
  });

  it("records creating before each request and created after identity verification", () => {
    const current = manifest();
    const cloudflare = cloudflareRunner();
    const checkpoints = [];

    provisionResources(current, {
      checkpoint: (next) => checkpoints.push(structuredClone(next)),
      runCommand: cloudflare.runCommand
    });

    expect(checkpoints.map((entry) => entry.d1.ownership).slice(0, 2)).toEqual([
      "creating",
      "created"
    ]);
    expect(checkpoints.at(-1).queue.deadLetter).toEqual({
      name: "hqbase-recovery-jobs-dlq",
      id: deadLetterQueueId,
      ownership: "created"
    });
  });

  it("fails closed instead of adopting an ambiguous create result", () => {
    const current = manifest();
    current.d1.ownership = "creating";
    const cloudflare = cloudflareRunner();

    expect(() =>
      prepareManifest(current, accountId, { runCommand: cloudflare.runCommand })
    ).toThrow(/ambiguous result/);
    expect(cloudflare.calls).toEqual([]);
  });

  it.each([
    [{ missingD1: true }, /D1 database.*missing/],
    [{ d1Name: "other-database" }, /not "hqbase-recovery"/],
    [{ r2Name: "other-bucket" }, /R2 returned/],
    [{ queueId: "f".repeat(32) }, /has ID.*not/],
    [{ queueName: "other-queue" }, /is named.*not/]
  ])("fails closed on missing or conflicting remote identity", (overrides, error) => {
    const current = markCreated(manifest(), 4);
    const cloudflare = cloudflareRunner(overrides);

    expect(() =>
      prepareManifest(current, accountId, { runCommand: cloudflare.runCommand })
    ).toThrow(error);
  });

  it("verifies and preserves reused ownership", () => {
    const current = markCreated(manifest(), 4);
    current.d1.ownership = "reused";
    current.r2.ownership = "reused";
    current.queue.primary.ownership = "reused";
    current.queue.deadLetter.ownership = "reused";

    expect(prepareManifest(current, accountId, { runCommand: cloudflareRunner().runCommand })).toBe(
      current
    );
  });

  it("migrates a complete version 2 manifest only after live identity checks", () => {
    const legacy = {
      ...manifest(),
      version: 2,
      accountId: undefined,
      d1: { name: "hqbase-recovery", id: d1Id, created: true, reused: false },
      r2: { bucket: "hqbase-recovery-mail", created: true, reused: false },
      queue: {
        name: "hqbase-recovery-jobs",
        deadLetterName: "hqbase-recovery-jobs-dlq",
        created: true
      }
    };
    const checkpoints = [];

    const migrated = prepareManifest(legacy, accountId, {
      checkpoint: (next) => checkpoints.push(structuredClone(next)),
      runCommand: cloudflareRunner().runCommand
    });

    expect(migrated.version).toBe(3);
    expect(migrated.accountId).toBe(accountId);
    expect(migrated.queue.primary.id).toBe(primaryQueueId);
    expect(migrated.queue.deadLetter.id).toBe(deadLetterQueueId);
    expect(checkpoints).toHaveLength(1);
  });

  it("refuses an incomplete version 2 manifest before a Cloudflare read", () => {
    const legacy = {
      ...manifest(),
      version: 2,
      accountId: undefined,
      d1: { name: "hqbase-recovery", id: d1Id, created: true, reused: false },
      r2: { bucket: "hqbase-recovery-mail", created: true, reused: false },
      queue: {
        name: "hqbase-recovery-jobs",
        deadLetterName: "hqbase-recovery-jobs-dlq",
        created: false
      }
    };
    const cloudflare = cloudflareRunner();

    expect(() => prepareManifest(legacy, accountId, { runCommand: cloudflare.runCommand })).toThrow(
      /incomplete version 2/
    );
    expect(cloudflare.calls).toEqual([]);
  });

  it("refuses a version 1 manifest before a Cloudflare read", () => {
    const legacy = { ...manifest(), version: 1 };
    delete legacy.accountId;
    const cloudflare = cloudflareRunner();

    expect(() => prepareManifest(legacy, accountId, { runCommand: cloudflare.runCommand })).toThrow(
      /version.*must be 3/
    );
    expect(cloudflare.calls).toEqual([]);
  });

  it("rejects a placeholder D1 UUID before a Cloudflare read", () => {
    const current = markCreated(manifest(), 1);
    current.d1.id = "00000000-0000-0000-0000-000000000000";
    const cloudflare = cloudflareRunner();

    expect(() =>
      prepareManifest(current, accountId, { runCommand: cloudflare.runCommand })
    ).toThrow(/real D1 database UUID/);
    expect(cloudflare.calls).toEqual([]);
  });
});

describe("Cloudflare account selection", () => {
  it("uses the only authenticated account", () => {
    const runCommand = () =>
      JSON.stringify({ loggedIn: true, accounts: [{ id: accountId, name: "test" }] });

    expect(resolveCloudflareAccount(undefined, { environment: {}, runCommand })).toBe(accountId);
    expect(resolveCloudflareAccount(null, { environment: {}, runCommand })).toBe(accountId);
  });

  it("requires an explicit account when Wrangler has several", () => {
    const runCommand = () =>
      JSON.stringify({
        loggedIn: true,
        accounts: [
          { id: accountId, name: "one" },
          { id: "b".repeat(32), name: "two" }
        ]
      });

    expect(() => resolveCloudflareAccount(undefined, { environment: {}, runCommand })).toThrow(
      /Set CLOUDFLARE_ACCOUNT_ID/
    );
  });

  it("rejects an account environment that conflicts with the manifest", () => {
    const runCommand = () =>
      JSON.stringify({ loggedIn: true, accounts: [{ id: accountId, name: "test" }] });

    expect(() =>
      resolveCloudflareAccount(accountId, {
        environment: { CLOUDFLARE_ACCOUNT_ID: "b".repeat(32) },
        runCommand
      })
    ).toThrow(/does not match CLOUDFLARE_ACCOUNT_ID/);
  });
});
