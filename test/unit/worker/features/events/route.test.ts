import type { WorkerEnv } from "@worker/lib/env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMailApiPrincipal: vi.fn()
}));

vi.mock("@worker/auth/mail-api", () => ({
  MailApiAuthError: class MailApiAuthError extends Error {},
  mailApiChallenge: vi.fn(() => "Bearer"),
  requireMailApiPrincipal: mocks.requireMailApiPrincipal
}));

import { handleMailEventRoute } from "@worker/features/events/route";

describe("mail event route configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMailApiPrincipal.mockResolvedValue({
      authentication: "session",
      principal: { id: "user-1" },
      scopes: new Set(["mail:read", "mail:send"])
    });
  });

  it("returns a safe fallback response when the Durable Object binding is missing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await handleMailEventRoute(
      new Request("https://mail.example.com/api/v2/events", {
        headers: {
          authorization: "Bearer secret-value",
          origin: "https://mail.example.com",
          upgrade: "websocket",
          "x-request-id": "request_12345678"
        }
      }),
      {} as WorkerEnv
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: {
        code: "EVENT_SERVICE_UNAVAILABLE",
        message: "The event service is unavailable. Continue with HTTP synchronization."
      }
    });
    expect(response?.headers.get("x-request-id")).toBe("request_12345678");
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        code: "EVENT_BINDING_MISSING",
        event: "mail_event_service_failure",
        requestId: "request_12345678"
      })
    );
    expect(log.mock.calls.flat().join(" ")).not.toContain("secret-value");
    log.mockRestore();
  });

  it("keeps an unavailable Durable Object request on the HTTP fallback path", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await handleMailEventRoute(
      new Request("https://mail.example.com/api/v2/events", {
        headers: { origin: "https://mail.example.com", upgrade: "websocket" }
      }),
      {
        MAIL_EVENTS: {
          getByName: () => ({ fetch: () => Promise.reject(new Error("platform failure")) })
        }
      } as unknown as WorkerEnv
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: "EVENT_SERVICE_UNAVAILABLE" }
    });
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
