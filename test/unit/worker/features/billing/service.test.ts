import { localState } from "@worker/features/billing/service";
import { describe, expect, it } from "vitest";

describe("local entitlement safety policy", () => {
  const now = "2026-07-11T12:00:00.000Z";

  it("keeps active, canceling, and past-due subscriptions configurable", () => {
    expect(localState("active", "active", null, now)).toEqual({
      state: "active",
      canConfigure: true,
      graceEndsAt: null
    });
    expect(localState("canceling", "active", null, now).state).toBe("canceling");
    expect(localState("past_due", "active", null, now).state).toBe("past_due");
  });

  it("starts a seven-day safety grace when Polar revokes the benefit", () => {
    expect(localState("inactive", "active", null, now)).toEqual({
      state: "grace",
      canConfigure: true,
      graceEndsAt: "2026-07-18T12:00:00.000Z"
    });
  });

  it("blocks only new administration after grace expires", () => {
    expect(localState("inactive", "grace", "2026-07-10T12:00:00.000Z", now)).toEqual({
      state: "inactive",
      canConfigure: false,
      graceEndsAt: "2026-07-10T12:00:00.000Z"
    });
  });
});
