// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signOutStartedEvent } from "@/features/auth/sign-out-lifecycle";
import { PersonalAccessTokenSettings } from "@/features/personal-access-tokens/personal-access-token-settings";
import { assertSecretSafeEqual } from "../../../helpers/secret-safe-assertions";

const apiMocks = vi.hoisted(() => ({
  createPersonalAccessToken: vi.fn(),
  listPersonalAccessTokens: vi.fn(),
  revokePersonalAccessToken: vi.fn()
}));
const recentAuthenticationMocks = vi.hoisted(() => ({
  getRecentAuthentication: vi.fn(),
  reauthenticate: vi.fn()
}));

vi.mock("@/features/personal-access-tokens/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/personal-access-tokens/api")>()),
  createPersonalAccessToken: apiMocks.createPersonalAccessToken,
  listPersonalAccessTokens: apiMocks.listPersonalAccessTokens,
  revokePersonalAccessToken: apiMocks.revokePersonalAccessToken
}));
vi.mock("@/features/auth/recent-authentication-api", () => ({
  getRecentAuthentication: recentAuthenticationMocks.getRecentAuthentication,
  reauthenticate: recentAuthenticationMocks.reauthenticate
}));

const actualApi = await vi.importActual<typeof import("@/features/personal-access-tokens/api")>(
  "@/features/personal-access-tokens/api"
);

const metadata = {
  id: "pat_created",
  userId: "user_member",
  ownerName: "Member User",
  name: "Automation",
  tokenSuffix: "oken",
  createdAt: "2026-08-20T12:00:00.000Z",
  expiresAt: null
};
const ambiguousMessage =
  "Token creation might have completed. Refresh the list and revoke any token whose value you did not receive.";

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.listPersonalAccessTokens.mockResolvedValue({ personalAccessTokens: [] });
  apiMocks.revokePersonalAccessToken.mockResolvedValue(undefined);
  recentAuthenticationMocks.getRecentAuthentication.mockResolvedValue(true);
  recentAuthenticationMocks.reauthenticate.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createPersonalAccessToken delivery classification", () => {
  it("classifies a rejected fetch as ambiguous without retry", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(actualApi.createPersonalAccessToken(createInput)).rejects.toBeInstanceOf(
      actualApi.AmbiguousPersonalAccessTokenCreateError
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/personal-access-tokens", {
      body: JSON.stringify(createInput),
      cache: "no-store",
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST"
    });
  });

  it("returns one validated successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ personalAccessToken: metadata, token: "test-only-token" }),
      status: 201
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await actualApi.createPersonalAccessToken(createInput);
    expect(result.personalAccessToken).toEqual(metadata);
    assertSecretSafeEqual(result.token, "test-only-token");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    500, 599
  ])("classifies status %s as ambiguous without reading its body", async (status) => {
    const json = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ json, status });
    vi.stubGlobal("fetch", fetchMock);

    await expect(actualApi.createPersonalAccessToken(createInput)).rejects.toBeInstanceOf(
      actualApi.AmbiguousPersonalAccessTokenCreateError
    );
    expect(json).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([200, 299])("classifies a status %s body-read failure as ambiguous", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockRejectedValue(new Error("unreadable")),
      status
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(actualApi.createPersonalAccessToken(createInput)).rejects.toBeInstanceOf(
      actualApi.AmbiguousPersonalAccessTokenCreateError
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("classifies malformed successful JSON as ambiguous", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ token: "test-only-token" }),
      status: 201
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(actualApi.createPersonalAccessToken(createInput)).rejects.toBeInstanceOf(
      actualApi.AmbiguousPersonalAccessTokenCreateError
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["UNAUTHENTICATED", 401, "Sign in again."],
    ["RECENT_AUTH_REQUIRED", 403, "Confirm your password and try again."],
    ["INVALID_PERSONAL_ACCESS_TOKEN", 400, "Check the token name and expiry."],
    [
      "PERSONAL_ACCESS_TOKEN_LIMIT_REACHED",
      409,
      "Revoke an active personal access token before creating another."
    ],
    ["RATE_LIMITED", 429, "Too many token creation attempts. Wait and try again."]
  ] as const)("uses the fixed local error for %s", async (code, status, message) => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        error: { code, message: "unused server message", detail: "unused non-secret detail" }
      }),
      status
    });
    vi.stubGlobal("fetch", fetchMock);

    const error = await actualApi.createPersonalAccessToken(createInput).catch((value) => value);
    expect(error).toBeInstanceOf(actualApi.PersonalAccessTokenApiError);
    expect(error).toMatchObject({ code, status, message });
    expect(error).not.toHaveProperty("detail");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    [302, { ignored: true }],
    [401, { error: { message: "missing code" } }],
    [400, { error: { code: "UNAUTHENTICATED" } }],
    [400, { error: { code: "UNKNOWN_CODE" } }]
  ])("classifies status %s with an untrusted body as ambiguous", async (status, body) => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(body),
      status
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(actualApi.createPersonalAccessToken(createInput)).rejects.toBeInstanceOf(
      actualApi.AmbiguousPersonalAccessTokenCreateError
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("personal access token creation UI", () => {
  it("gates creation, clears expiry, copies once, and clears on modal close", async () => {
    let copiedValue: string | null = null;
    let hasCopyReference = false;
    const recentCheck = deferred<boolean>();
    recentAuthenticationMocks.getRecentAuthentication.mockReturnValueOnce(recentCheck.promise);
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (value) => {
      copiedValue = value;
    });
    apiMocks.createPersonalAccessToken.mockResolvedValue({
      personalAccessToken: metadata,
      token: "test-only-token"
    });
    render(
      <PersonalAccessTokenSettings
        userRole="member"
        onCopyReferenceChange={(hasValue) => {
          hasCopyReference = hasValue;
        }}
      />
    );
    await screen.findByText("No active personal access tokens.");

    await user.click(screen.getByRole("button", { name: "Create token" }));
    expect(recentAuthenticationMocks.getRecentAuthentication).toHaveBeenCalledOnce();
    expect(screen.getByText("Checking sign-in…")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    recentCheck.resolve(true);
    const name = await screen.findByRole("textbox", { name: "Name" });
    const expiry = screen.getByLabelText<HTMLInputElement>("Expires");
    expect(expiry.value).not.toBe("");
    await user.type(name, "  Automation  ");
    await user.clear(expiry);
    await user.click(screen.getByRole("button", { name: "Create personal access token" }));

    await screen.findByText("Copy this token now. HQBase cannot show it again.");
    expect(apiMocks.createPersonalAccessToken).toHaveBeenCalledOnce();
    expect(apiMocks.createPersonalAccessToken).toHaveBeenCalledWith({
      expiresAt: null,
      name: "Automation"
    });
    expect(hasCopyReference).toBe(true);
    await user.click(screen.getByRole("button", { name: "Copy token" }));
    if (copiedValue === null) throw new Error("The clipboard write did not occur.");
    assertSecretSafeEqual(copiedValue, "test-only-token");

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("Copy this token now. HQBase cannot show it again.")).toBeNull();
    expect(hasCopyReference).toBe(false);
    expect(apiMocks.createPersonalAccessToken).toHaveBeenCalledOnce();
  });

  it("closes and refreshes after ambiguous delivery without retry", async () => {
    apiMocks.createPersonalAccessToken.mockRejectedValue(
      new actualApi.AmbiguousPersonalAccessTokenCreateError()
    );
    const user = userEvent.setup();
    render(<PersonalAccessTokenSettings userRole="member" />);
    await submitCreateForm(user);

    await screen.findByText(ambiguousMessage);
    expect(screen.queryByRole("dialog", { name: "Create personal access token" })).toBeNull();
    expect(apiMocks.createPersonalAccessToken).toHaveBeenCalledOnce();
    expect(apiMocks.listPersonalAccessTokens).toHaveBeenCalledTimes(2);
  });

  it("keeps a definitive fixed error in the form without retry", async () => {
    apiMocks.createPersonalAccessToken.mockRejectedValue(
      new actualApi.PersonalAccessTokenApiError(
        "PERSONAL_ACCESS_TOKEN_LIMIT_REACHED",
        409,
        "Revoke an active personal access token before creating another."
      )
    );
    const user = userEvent.setup();
    render(<PersonalAccessTokenSettings userRole="member" />);
    await submitCreateForm(user);

    await screen.findByText("Revoke an active personal access token before creating another.");
    expect(screen.getByRole("dialog", { name: "Create personal access token" })).toBeTruthy();
    expect(apiMocks.createPersonalAccessToken).toHaveBeenCalledOnce();
    expect(apiMocks.listPersonalAccessTokens).toHaveBeenCalledOnce();
  });

  it.each([
    "pagehide",
    "sign-out",
    "unmount"
  ] as const)("clears plaintext synchronously on %s", async (lifecycle) => {
    let hasCopyReference = false;
    let clipboardWriteOccurred = false;
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async () => {
      clipboardWriteOccurred = true;
    });
    apiMocks.createPersonalAccessToken.mockResolvedValue({
      personalAccessToken: metadata,
      token: "test-only-token"
    });
    const view = render(
      <PersonalAccessTokenSettings
        userRole="member"
        onCopyReferenceChange={(hasValue) => {
          hasCopyReference = hasValue;
        }}
      />
    );
    await submitCreateForm(user);
    await screen.findByText("Copy this token now. HQBase cannot show it again.");
    expect(hasCopyReference).toBe(true);

    if (lifecycle === "pagehide") window.dispatchEvent(new Event("pagehide"));
    else if (lifecycle === "sign-out") window.dispatchEvent(new Event(signOutStartedEvent));
    else view.unmount();

    const tokenIsVisible = document.body.textContent?.includes("test-only-token") ?? false;
    expect(tokenIsVisible).toBe(false);
    expect(hasCopyReference).toBe(false);
    expect(clipboardWriteOccurred).toBe(false);
  });

  it.each([
    "pagehide",
    "sign-out",
    "unmount"
  ] as const)("discards a create result that arrives after %s", async (lifecycle) => {
    let hasCopyReference = false;
    const createResult = deferred<{
      personalAccessToken: typeof metadata;
      token: string;
    }>();
    apiMocks.createPersonalAccessToken.mockReturnValue(createResult.promise);
    const user = userEvent.setup();
    const view = render(
      <PersonalAccessTokenSettings
        userRole="member"
        onCopyReferenceChange={(hasValue) => {
          hasCopyReference = hasValue;
        }}
      />
    );
    await submitCreateForm(user);

    if (lifecycle === "pagehide") window.dispatchEvent(new Event("pagehide"));
    else if (lifecycle === "sign-out") window.dispatchEvent(new Event(signOutStartedEvent));
    else view.unmount();

    await act(async () => {
      createResult.resolve({ personalAccessToken: metadata, token: "test-only-token" });
      await createResult.promise;
    });

    const tokenIsVisible = document.body.textContent?.includes("test-only-token") ?? false;
    expect(tokenIsVisible).toBe(false);
    expect(hasCopyReference).toBe(false);
    expect(apiMocks.createPersonalAccessToken).toHaveBeenCalledOnce();
    expect(apiMocks.createPersonalAccessToken).toHaveBeenCalledWith({
      expiresAt: expect.any(String),
      name: "Automation"
    });
    expect(screen.queryByText("Copy this token now. HQBase cannot show it again.")).toBeNull();
    if (lifecycle === "unmount") {
      expect(apiMocks.listPersonalAccessTokens).toHaveBeenCalledOnce();
    } else {
      await waitFor(() => expect(apiMocks.listPersonalAccessTokens).toHaveBeenCalledTimes(2));
      expect(screen.getByText(ambiguousMessage)).toBeTruthy();
    }
  });
});

const createInput = { name: "Automation", expiresAt: null };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function submitCreateForm(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await screen.findByText("No active personal access tokens.");
  await user.click(screen.getByRole("button", { name: "Create token" }));
  const name = await screen.findByRole("textbox", { name: "Name" });
  await user.type(name, "Automation");
  await user.click(screen.getByRole("button", { name: "Create personal access token" }));
  await waitFor(() => expect(apiMocks.createPersonalAccessToken).toHaveBeenCalledOnce());
}
