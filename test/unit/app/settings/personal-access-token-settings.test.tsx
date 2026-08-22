// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalAccessTokenSettings } from "@/features/personal-access-tokens/personal-access-token-settings";
import type { WorkspaceRole } from "@/features/users/types";
import { flushHookEffects, renderComponent } from "../render-hook";

const token = {
  id: "pat_example",
  userId: "user_owner",
  ownerName: "Avery Stone",
  name: "Deployment agent",
  tokenSuffix: "Ab_9",
  createdAt: "2026-08-20T12:00:00.000Z",
  expiresAt: null
};

beforeEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("personal access token settings", () => {
  it.each([
    ["owner", true],
    ["admin", false],
    ["member", false]
  ] as const)("loads one metadata list for a %s and applies owner-column rules", async (role, ownerColumn) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ personalAccessTokens: [token] }));
    vi.stubGlobal("fetch", fetchMock);

    const view = await renderSettings(role);
    await flushHookEffects();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/personal-access-tokens", {
      cache: "no-store",
      credentials: "include",
      method: "GET"
    });
    const headings = [...view.container.querySelectorAll("th")].map((cell) => cell.textContent);
    expect(headings.includes("Owner")).toBe(ownerColumn);
    expect(view.container.textContent).toContain(
      "Personal access tokens can call every Mail API operation, subject to the token owner's current role and mailbox grants."
    );
    expect(view.container.textContent).toContain(
      "Personal access tokens cannot access workspace administration or MCP."
    );
    expect(view.container.textContent).toContain("Deployment agent");
    expect(view.container.textContent).toContain("Create token");
    expect(view.container.textContent).toContain("••••Ab_9");
    expect(view.container.textContent).not.toContain("tokenHash");
    expect(view.container.textContent).not.toContain("Revoked");
    expect(view.container.textContent).not.toContain("Next page");
    await view.unmount();
  });

  it("names the token, revokes it once, and refreshes the active metadata list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ personalAccessTokens: [token] }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ personalAccessTokens: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const view = await renderSettings("owner");
    document.body.appendChild(view.container);
    await flushHookEffects();

    const revoke = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Revoke Deployment agent"]'
    );
    await flushHookEffects(() => revoke?.click());
    expect(document.body.textContent).toContain("Revoke Deployment agent?");
    expect(document.body.textContent).toContain("Active clients will fail on their next request.");

    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Revoke token"
    );
    await flushHookEffects(() => confirm?.click());

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/personal-access-tokens/pat_example", {
      cache: "no-store",
      credentials: "include",
      method: "DELETE"
    });
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "DELETE")).toHaveLength(
      1
    );
    expect(view.container.textContent).not.toContain("Deployment agent");
    await view.unmount();
  });

  it("keeps the newest token list when an older refresh finishes last", async () => {
    const olderList = deferred<Response>();
    const newerList = deferred<Response>();
    const fetchMock = patCreationFetch([olderList.promise, newerList.promise]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const view = await renderSettings("member");
    document.body.appendChild(view.container);

    await createToken(user);
    await waitFor(() => expect(personalAccessTokenListCalls(fetchMock)).toHaveLength(2));

    newerList.resolve(
      jsonResponse({
        personalAccessTokens: [{ ...token, id: "pat_newer", name: "Newest client" }]
      })
    );
    await screen.findByText("Newest client");

    olderList.resolve(
      jsonResponse({
        personalAccessTokens: [{ ...token, id: "pat_older", name: "Older client" }]
      })
    );
    await flushHookEffects();

    expect(view.container.textContent).toContain("Newest client");
    expect(view.container.textContent).not.toContain("Older client");
    await view.unmount();
  });

  it("keeps the latest refresh loading when an older refresh fails", async () => {
    const olderList = deferred<Response>();
    const newerList = deferred<Response>();
    const fetchMock = patCreationFetch([olderList.promise, newerList.promise]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const view = await renderSettings("member");
    document.body.appendChild(view.container);

    await createToken(user);
    await waitFor(() => expect(personalAccessTokenListCalls(fetchMock)).toHaveLength(2));

    olderList.reject(new Error("older refresh failed"));
    await flushHookEffects();

    expect(view.container.textContent).toContain("Loading personal access tokens…");
    expect(view.container.textContent).not.toContain("older refresh failed");

    newerList.resolve(jsonResponse({ personalAccessTokens: [] }));
    await waitFor(() =>
      expect(view.container.textContent).toContain("No active personal access tokens.")
    );
    await view.unmount();
  });
});

async function renderSettings(role: WorkspaceRole) {
  return renderComponent(<PersonalAccessTokenSettings userRole={role} />);
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

function patCreationFetch(listResponses: Promise<Response>[]) {
  let listIndex = 0;
  return vi.fn((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const path = String(input);
    if (path === "/api/personal-access-tokens" && init?.method === "GET") {
      const response = listResponses[listIndex];
      listIndex += 1;
      if (!response) return Promise.reject(new Error("Unexpected PAT list request."));
      return response;
    }
    if (path === "/api/sessions/recent-authentication" && init?.method === "GET") {
      return Promise.resolve(jsonResponse({ recent: true }));
    }
    if (path === "/api/personal-access-tokens" && init?.method === "POST") {
      return Promise.resolve(
        new Response(
          JSON.stringify({ personalAccessToken: token, token: "test-only-race-token" }),
          { headers: { "content-type": "application/json" }, status: 201 }
        )
      );
    }
    return Promise.reject(new Error(`Unexpected request: ${init?.method ?? "GET"} ${path}`));
  });
}

function personalAccessTokenListCalls(fetchMock: ReturnType<typeof vi.fn>): unknown[][] {
  return fetchMock.mock.calls.filter(
    ([path, init]) => path === "/api/personal-access-tokens" && init?.method === "GET"
  );
}

async function createToken(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Create token" }));
  const name = await screen.findByRole("textbox", { name: "Name" });
  await user.type(name, "Race client");
  await user.click(screen.getByRole("button", { name: "Create personal access token" }));
  await screen.findByText("Copy this token now. HQBase cannot show it again.");
}

function deferred<T>(): {
  promise: Promise<T>;
  reject: (reason: unknown) => void;
  resolve: (value: T) => void;
} {
  let reject!: (reason: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
