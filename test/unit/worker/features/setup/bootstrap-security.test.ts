import {
  type BootstrapLock,
  startBootstrapLockHeartbeat
} from "@worker/features/setup/bootstrap-lock";
import { requireDirectBootstrapClientIp } from "@worker/features/setup/routes";
import { describe, expect, it, vi } from "vitest";

describe("setup bootstrap security", () => {
  it("rejects Worker-originated and unidentified bootstrap requests", () => {
    expect(() =>
      requireDirectBootstrapClientIp(
        new Request("https://hqbase.test/api/setup/bootstrap", {
          headers: { "cf-connecting-ip": "192.0.2.10", "cf-worker": "example.com" }
        })
      )
    ).toThrowError(expect.objectContaining({ code: "SETUP_DIRECT_REQUEST_REQUIRED", status: 403 }));

    expect(() =>
      requireDirectBootstrapClientIp(
        new Request("https://hqbase.test/api/setup/bootstrap", {
          headers: { "cf-connecting-ip": " " }
        })
      )
    ).toThrowError(expect.objectContaining({ code: "SETUP_CLIENT_IP_REQUIRED", status: 403 }));
  });

  it("returns the Cloudflare client IP for a direct request", () => {
    expect(
      requireDirectBootstrapClientIp(
        new Request("https://hqbase.test/api/setup/bootstrap", {
          headers: { "cf-connecting-ip": " 192.0.2.10 " }
        })
      )
    ).toBe("192.0.2.10");
  });

  it("renews an active lock on the heartbeat interval", async () => {
    vi.useFakeTimers();
    try {
      const lock: BootstrapLock = { value: '{"token":"test"}' };
      const first = vi.fn(async () => ({ value_json: lock.value }));
      const bind = vi.fn(() => ({ first }));
      const db = { prepare: vi.fn(() => ({ bind })) } as unknown as D1Database;
      const heartbeat = startBootstrapLockHeartbeat(db, lock, 100);

      await vi.advanceTimersByTimeAsync(250);
      await heartbeat.stop();

      expect(first).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
