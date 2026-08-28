import { describe, expect, it, vi } from "vitest";

import { destroyPlan, destroyResources, destroyTargets } from "../../../scripts/hqbase/destroy.mjs";
import { configPath, recordWorkerDeployedForConfig } from "../../../scripts/hqbase/manifest.mjs";

const scopes = ["worker", "data", "storage", "state", "domain", "all"];

function manifest({ ownership = "created" } = {}) {
  return {
    version: 3,
    name: "qa",
    accountId: "a".repeat(32),
    worker: { name: "hqbase-qa", deployed: true },
    d1: {
      name: "hqbase-data",
      id: "11111111-1111-4111-8111-111111111111",
      ownership
    },
    r2: { bucket: "hqbase-mail", ownership },
    queue: {
      primary: { name: "hqbase-jobs", id: "1".repeat(32), ownership },
      deadLetter: { name: "hqbase-jobs-dlq", id: "2".repeat(32), ownership }
    },
    email: null
  };
}

describe("operator destroy scopes", () => {
  it("removes disposable state without removing the Worker or domain", () => {
    expect(destroyTargets("state")).toEqual({
      domain: false,
      worker: false,
      data: true,
      storage: true,
      queues: true
    });
  });

  it("removes every deployment resource for the all scope", () => {
    expect(destroyTargets("all")).toEqual({
      domain: true,
      worker: true,
      data: true,
      storage: true,
      queues: true
    });
  });

  it("rejects unknown scopes", () => {
    expect(() => destroyTargets("ephemeral")).toThrowError(/Unknown destroy scope/);
  });

  it.each(scopes)("honors the %s scope for created resources", (scope) => {
    const targets = destroyTargets(scope);
    const plan = destroyPlan(scope, manifest());

    expect(plan).toMatchObject({
      ...targets,
      worker: targets.worker,
      data: targets.data,
      storage: targets.storage,
      queueResources: { primary: targets.queues, deadLetter: targets.queues },
      preserved: {
        data: false,
        storage: false,
        primaryQueue: false,
        deadLetterQueue: false
      }
    });
  });

  it.each(scopes)("preserves every reused resource for the %s scope", (scope) => {
    const targets = destroyTargets(scope);
    const plan = destroyPlan(scope, manifest({ ownership: "reused" }));

    expect(plan).toMatchObject({
      data: false,
      storage: false,
      queueResources: { primary: false, deadLetter: false },
      preserved: {
        data: targets.data,
        storage: targets.storage,
        primaryQueue: targets.queues,
        deadLetterQueue: targets.queues
      }
    });
  });

  it("skips resources already removed by a partial cleanup", () => {
    const input = manifest();
    input.d1.ownership = "removed";
    input.queue.primary.ownership = "removed";

    expect(destroyPlan("state", input)).toMatchObject({
      data: false,
      storage: true,
      queueResources: { primary: false, deadLetter: true }
    });
  });

  it("does not delete a Worker that was never recorded as deployed", () => {
    const input = manifest();
    input.worker.deployed = false;

    expect(destroyPlan("worker", input).worker).toBe(false);
  });

  it("fails closed on a legacy manifest before planning a mutation", () => {
    expect(() => destroyPlan("all", { ...manifest(), version: 2 })).toThrowError(
      /version.*must be 3/
    );
  });

  it("fails closed on a placeholder D1 UUID", () => {
    const input = manifest();
    input.d1.id = "00000000-0000-0000-0000-000000000000";

    expect(() => destroyPlan("data", input)).toThrowError(/real D1 database UUID/);
  });

  it("fails before mutation when queue ownership is ambiguous", () => {
    const input = manifest();
    input.queue.deadLetter.ownership = "creating";
    input.queue.deadLetter.id = null;

    expect(() => destroyPlan("state", input)).toThrowError(/ambiguous result/);
  });

  it("deletes D1 by its real UUID and checkpoints each independent resource", () => {
    const input = manifest();
    input.worker.deployed = false;
    const commands = [];
    const checkpoints = [];

    destroyResources("state", input, {
      checkpoint: (next) => checkpoints.push(structuredClone(next)),
      runCommand: (_command, args) => {
        commands.push(args.slice(2));
        return "";
      }
    });

    expect(commands).toContainEqual([
      "d1",
      "delete",
      "11111111-1111-4111-8111-111111111111",
      "--skip-confirmation"
    ]);
    expect(commands).not.toContainEqual(["d1", "delete", "hqbase-data", "--skip-confirmation"]);
    expect(checkpoints).toHaveLength(4);
    expect(checkpoints.at(-1)).toMatchObject({
      d1: { ownership: "removed" },
      r2: { ownership: "removed" },
      queue: {
        primary: { ownership: "removed" },
        deadLetter: { ownership: "removed" }
      }
    });
  });

  it("detaches the queue consumer before deleting the Worker", () => {
    const commands = [];

    destroyResources("all", manifest(), {
      checkpoint: () => {},
      runCommand: (_command, args) => {
        commands.push(args.slice(2));
        return "";
      }
    });

    const detach = commands.findIndex(
      (args) => args.join(" ") === "queues consumer worker remove hqbase-jobs hqbase-qa"
    );
    const removeWorker = commands.findIndex(
      (args) => args.join(" ") === "delete hqbase-qa --force"
    );
    expect(detach).toBeGreaterThanOrEqual(0);
    expect(removeWorker).toBeGreaterThan(detach);
  });

  it("empties created storage after stopping writers and before deleting the bucket", () => {
    const events = [];

    destroyResources("all", manifest(), {
      checkpoint: () => {},
      emptyBucket: (input) => events.push(`empty ${input.r2.bucket}`),
      runCommand: (_command, args) => {
        const operation = args.slice(2).join(" ");
        if (operation === "delete hqbase-qa --force") events.push("delete worker");
        if (operation === "r2 bucket delete hqbase-mail") events.push("delete bucket");
        return "";
      }
    });

    expect(events).toEqual(["delete worker", "empty hqbase-mail", "delete bucket"]);
  });

  it("does not empty reused storage", () => {
    const emptyBucket = vi.fn();

    destroyResources("storage", manifest({ ownership: "reused" }), {
      checkpoint: () => {},
      emptyBucket,
      runCommand: () => ""
    });

    expect(emptyBucket).not.toHaveBeenCalled();
  });

  it("records a direct signed deploy before deleting its bound queues", () => {
    const input = manifest();
    input.worker.deployed = false;
    const checkpoints = [];

    recordWorkerDeployedForConfig(configPath(input.name), input.worker.name, {
      loadManifest: () => input,
      writeManifest: (next) => checkpoints.push(structuredClone(next))
    });

    const commands = [];
    destroyResources("all", input, {
      checkpoint: () => {},
      runCommand: (_command, args) => {
        commands.push(args.slice(2));
        return "";
      }
    });

    const removeWorker = commands.findIndex(
      (args) => args.join(" ") === "delete hqbase-qa --force"
    );
    const removeQueue = commands.findIndex(
      (args) => args.join(" ") === "queues delete hqbase-jobs"
    );
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].worker.deployed).toBe(true);
    expect(removeWorker).toBeGreaterThanOrEqual(0);
    expect(removeQueue).toBeGreaterThan(removeWorker);
  });

  it("refuses to update a manifest from another deployment directory", () => {
    const input = manifest();
    input.name = "other";
    input.worker.deployed = false;
    const checkpoints = [];

    expect(() =>
      recordWorkerDeployedForConfig(configPath("qa"), input.worker.name, {
        loadManifest: () => input,
        writeManifest: (next) => checkpoints.push(structuredClone(next))
      })
    ).toThrow(/manifest name "other" does not match deployment "qa"/);
    expect(input.worker.deployed).toBe(false);
    expect(checkpoints).toEqual([]);
  });

  it("keeps completed cleanup checkpoints when emptying storage fails", () => {
    const input = manifest();
    input.worker.deployed = false;
    const checkpoints = [];

    expect(() =>
      destroyResources("state", input, {
        checkpoint: (next) => checkpoints.push(structuredClone(next)),
        emptyBucket: () => {
          throw new Error("could not empty bucket");
        },
        runCommand: () => ""
      })
    ).toThrow(/could not empty bucket/);

    expect(checkpoints).toHaveLength(2);
    expect(input).toMatchObject({
      d1: { ownership: "created" },
      r2: { ownership: "created" },
      queue: {
        primary: { ownership: "removed" },
        deadLetter: { ownership: "removed" }
      }
    });
  });
});
