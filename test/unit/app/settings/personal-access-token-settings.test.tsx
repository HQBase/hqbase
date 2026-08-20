// @vitest-environment happy-dom
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
