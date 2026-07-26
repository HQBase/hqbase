import { describe, expect, it } from "vitest";

import { destroyPlan, destroyTargets } from "../../../scripts/hqbase/destroy.mjs";

const scopes = ["worker", "data", "storage", "state", "domain", "all"];

function manifest({ reused = false } = {}) {
  return {
    version: 1,
    name: "qa",
    worker: { name: "hqbase-qa" },
    d1: { name: "hqbase-data", reused },
    r2: { bucket: "hqbase-mail", reused },
    queue: { name: "hqbase-jobs", deadLetterName: "hqbase-jobs-dlq" },
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

  it.each(scopes)("honors the %s scope for fresh resources", (scope) => {
    const targets = destroyTargets(scope);

    expect(destroyPlan(scope, manifest())).toEqual({
      ...targets,
      preserved: { data: false, storage: false }
    });
  });

  it.each(scopes)("preserves externally owned D1 and R2 for the %s scope", (scope) => {
    const targets = destroyTargets(scope);

    expect(destroyPlan(scope, manifest({ reused: true }))).toEqual({
      ...targets,
      data: false,
      storage: false,
      preserved: {
        data: targets.data,
        storage: targets.storage
      }
    });
  });

  it("fails closed on a legacy manifest without ownership flags", () => {
    expect(() =>
      destroyPlan("all", {
        version: 1,
        d1: { name: "external-data" },
        r2: { bucket: "external-mail", reused: true }
      })
    ).toThrowError(/"d1\.reused".*Migrate or repair/);
  });

  it("fails closed on an unsupported manifest version", () => {
    expect(() => destroyPlan("worker", { ...manifest(), version: 0 })).toThrowError(
      /"version".*Migrate or repair/
    );
  });

  it("fails closed on non-boolean ownership metadata", () => {
    expect(() =>
      destroyPlan("all", {
        ...manifest(),
        r2: { bucket: "external-mail", reused: "true" }
      })
    ).toThrowError(/"r2\.reused".*explicit boolean/);
  });

  it.each([
    { d1Reused: true, r2Reused: false, data: false, storage: true },
    { d1Reused: false, r2Reused: true, data: true, storage: false }
  ])("honors independent D1 and R2 ownership flags", ({ d1Reused, r2Reused, data, storage }) => {
    const input = manifest();
    input.d1.reused = d1Reused;
    input.r2.reused = r2Reused;

    expect(destroyPlan("state", input)).toMatchObject({
      data,
      storage,
      preserved: { data: d1Reused, storage: r2Reused }
    });
  });

  it("fails before mutation when a selected resource name is ambiguous", () => {
    const input = manifest();
    input.queue.deadLetterName = "";

    expect(() => destroyPlan("state", input)).toThrowError(
      /"queue\.deadLetterName".*Migrate or repair/
    );
  });
});
