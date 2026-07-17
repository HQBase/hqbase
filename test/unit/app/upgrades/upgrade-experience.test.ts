import { describe, expect, it, vi } from "vitest";
import type { UpgradeStatus } from "../../../../app/features/upgrades/types";
import {
  requiresUpgradeSignIn,
  retryUpgradeStep
} from "../../../../app/features/upgrades/upgrade-experience";

describe("Pro upgrade retry", () => {
  it.each([
    "UNAUTHENTICATED",
    "RECENT_AUTH_REQUIRED"
  ])("requires an explicit sign-in action for %s", (errorCode) => {
    expect(requiresUpgradeSignIn(errorCode)).toBe(true);
  });

  it("keeps ordinary upgrade failures retryable", () => {
    expect(requiresUpgradeSignIn("CLOUDFLARE_UPGRADE_API_ERROR")).toBe(false);
    expect(requiresUpgradeSignIn(null)).toBe(false);
  });

  it("clears the local error gate and restarts the persisted step loop", () => {
    const setError = vi.fn();
    const setErrorCode = vi.fn();
    const setStatus = vi.fn();
    const current = {
      id: "upgrade-1",
      state: "candidate_uploaded",
      errorCode: null,
      recoveryAction: null,
      updatedAt: "2026-07-16T01:00:00-04:00",
      completedAt: null
    } satisfies UpgradeStatus;

    retryUpgradeStep(setError, setErrorCode, setStatus);

    expect(setError).toHaveBeenCalledWith(null);
    expect(setErrorCode).toHaveBeenCalledWith(null);
    const update = setStatus.mock.calls[0]?.[0] as (value: UpgradeStatus | null) => UpgradeStatus;
    expect(update(current)).toEqual(current);
    expect(update(current)).not.toBe(current);
  });
});
