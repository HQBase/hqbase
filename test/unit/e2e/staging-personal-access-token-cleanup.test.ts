import { describe, expect, it, vi } from "vitest";
import {
  cleanupPersonalAccessToken,
  throwWithCleanupContext
} from "../../e2e/staging/personal-access-token-cleanup";

type FakeResponse = { status(): number; json(): Promise<unknown> };

function response(status: number, body: unknown): FakeResponse {
  return { status: () => status, json: async () => body };
}

function input() {
  return {
    creationAttempted: true,
    recordId: "pat_cleanup",
    uniqueName: "PAT cleanup",
    list: vi.fn(async () => response(200, { personalAccessTokens: [] })),
    revoke: vi.fn(async () => response(204, null))
  };
}

describe("staging personal access token cleanup", () => {
  it("does nothing when token creation was not attempted", async () => {
    const value = { ...input(), creationAttempted: false };

    await expect(cleanupPersonalAccessToken(value)).resolves.toBeUndefined();
    expect(value.list).not.toHaveBeenCalled();
    expect(value.revoke).not.toHaveBeenCalled();
  });

  it("revokes an active token that matches the recorded ID", async () => {
    const value = input();
    value.list.mockResolvedValue(
      response(200, {
        personalAccessTokens: [{ id: "pat_cleanup", name: "Different name" }]
      })
    );

    await cleanupPersonalAccessToken(value);

    expect(value.revoke).toHaveBeenCalledOnce();
    expect(value.revoke).toHaveBeenCalledWith("pat_cleanup");
  });

  it("uses the unique name when the recorded ID is unavailable", async () => {
    const value = { ...input(), recordId: null };
    value.list.mockResolvedValue(
      response(200, {
        personalAccessTokens: [{ id: "pat_by_name", name: "PAT cleanup" }]
      })
    );

    await cleanupPersonalAccessToken(value);

    expect(value.revoke).toHaveBeenCalledWith("pat_by_name");
  });

  it("falls back to the unique name when the recorded ID is not active", async () => {
    const value = input();
    value.list.mockResolvedValue(
      response(200, {
        personalAccessTokens: [{ id: "pat_by_name", name: "PAT cleanup" }]
      })
    );

    await cleanupPersonalAccessToken(value);

    expect(value.revoke).toHaveBeenCalledWith("pat_by_name");
  });

  it("finishes when no active token matches", async () => {
    const value = input();
    value.list.mockResolvedValue(
      response(200, {
        personalAccessTokens: [{ id: "pat_other", name: "Other PAT" }]
      })
    );

    await expect(cleanupPersonalAccessToken(value)).resolves.toBeUndefined();
    expect(value.revoke).not.toHaveBeenCalled();
  });

  it("fails safely when the list request rejects", async () => {
    const value = input();
    value.list.mockRejectedValue(new Error("synthetic request failure"));

    await expect(cleanupPersonalAccessToken(value)).rejects.toThrow(
      "PAT cleanup list request failed."
    );
  });

  it("fails safely when the list status is not successful", async () => {
    const value = input();
    value.list.mockResolvedValue(response(500, { ignored: "response body" }));

    await expect(cleanupPersonalAccessToken(value)).rejects.toThrow(
      "PAT cleanup list failed with status 500."
    );
  });

  it("fails safely when the list body is not JSON", async () => {
    const value = input();
    value.list.mockResolvedValue({
      status: () => 200,
      json: async () => {
        throw new Error("synthetic JSON failure");
      }
    });

    await expect(cleanupPersonalAccessToken(value)).rejects.toThrow(
      "PAT cleanup list returned invalid JSON."
    );
  });

  it.each([
    ["a non-array list", { personalAccessTokens: null }],
    ["an item without an ID", { personalAccessTokens: [{ name: "PAT cleanup" }] }],
    ["an item without a name", { personalAccessTokens: [{ id: "pat_cleanup" }] }]
  ])("fails safely for %s", async (_label, body) => {
    const value = input();
    value.list.mockResolvedValue(response(200, body));

    await expect(cleanupPersonalAccessToken(value)).rejects.toThrow(
      "PAT cleanup list returned malformed metadata."
    );
  });

  it("fails safely when the revoke request rejects", async () => {
    const value = input();
    value.list.mockResolvedValue(
      response(200, { personalAccessTokens: [{ id: "pat_cleanup", name: "PAT cleanup" }] })
    );
    value.revoke.mockRejectedValue(new Error("synthetic request failure"));

    await expect(cleanupPersonalAccessToken(value)).rejects.toThrow(
      "PAT cleanup revoke request failed."
    );
  });

  it("throws a cleanup status failure when the main test succeeded", async () => {
    const value = input();
    value.list.mockResolvedValue(
      response(200, { personalAccessTokens: [{ id: "pat_cleanup", name: "PAT cleanup" }] })
    );
    value.revoke.mockResolvedValue(response(500, { ignored: "response body" }));

    await expect(cleanupPersonalAccessToken(value)).rejects.toThrow(
      "PAT cleanup revoke failed with status 500."
    );
  });
});

describe("staging cleanup error preservation", () => {
  it("preserves the same primary Error and adds safe cleanup context", () => {
    const primary = new Error("primary test failure");
    const cleanup = new Error("cleanup failed with status 500");
    let thrown: unknown;

    try {
      throwWithCleanupContext(primary, cleanup);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(primary);
    expect(primary.message).toContain("primary test failure");
    expect(primary.message).toContain("Cleanup also failed: cleanup failed with status 500");
    expect(primary.stack).toContain("Cleanup failure:");
  });

  it("preserves ordered child details from combined cleanup failures", () => {
    const primary = new Error("primary test failure");
    const cleanup = new AggregateError(
      [
        new Error("PAT request context disposal failed."),
        new Error("PAT cleanup revoke failed with status 500.")
      ],
      "PAT staging cleanup failed."
    );

    expect(() => throwWithCleanupContext(primary, cleanup)).toThrow(primary);
    expect(primary.message.indexOf("PAT request context disposal failed.")).toBeLessThan(
      primary.message.indexOf("PAT cleanup revoke failed with status 500.")
    );
    expect(primary.stack).toContain("PAT request context disposal failed.");
    expect(primary.stack).toContain("PAT cleanup revoke failed with status 500.");
  });
});
