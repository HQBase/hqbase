import { describe, expect, it } from "vitest";

import { destroyTargets } from "../../../scripts/hqbase-pro/destroy.mjs";

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
});
