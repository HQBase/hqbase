import { describe, expect, it, vi } from "vitest";
import type { UpgradeStatus } from "../../../../app/features/upgrades/types";
import {
  completePromotedUpgrade,
  isPromotionHandoffPending,
  proCompletionUrl,
  requiresUpgradeSignIn,
  retryUpgradeStep,
  shouldCompleteWithProRuntime
} from "../../../../app/features/upgrades/upgrade-experience";
import { ApiRequestError } from "../../../../app/lib/api-client";

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

  it("hands promoted state to the active Pro completion endpoint", () => {
    expect(shouldCompleteWithProRuntime("candidate_verified")).toBe(false);
    expect(shouldCompleteWithProRuntime("promoted")).toBe(true);
    expect(shouldCompleteWithProRuntime("complete")).toBe(false);
  });

  it("retries only the Community runtime pending sentinel", async () => {
    let attempts = 0;
    const request = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new ApiRequestError(
          "UPGRADE_RUNTIME_HANDOFF_PENDING",
          "Pro is still becoming active."
        );
      }
      return { state: "complete" };
    });
    const wait = vi.fn(async () => undefined);

    await expect(completePromotedUpgrade(request, wait, () => false, 4)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(isPromotionHandoffPending(new Error("pending"))).toBe(false);
  });

  it("stops the automatic handoff instead of entering a reload loop", async () => {
    const request = vi.fn(async () => {
      throw new ApiRequestError("UPGRADE_RUNTIME_HANDOFF_PENDING", "Pro is still becoming active.");
    });
    const wait = vi.fn(async () => undefined);

    await expect(completePromotedUpgrade(request, wait, () => false, 2)).rejects.toMatchObject({
      code: "UPGRADE_RUNTIME_HANDOFF_TIMEOUT"
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("uses one cache-busted navigation after Pro completes", () => {
    expect(proCompletionUrl(1234)).toBe("/settings?upgrade=complete&cutover=1234");
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
