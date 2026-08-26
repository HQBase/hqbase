// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { listOAuthConnections, revokeOAuthConnection } from "@/features/connected-apps/api";
import { ConnectedAppsPage } from "@/features/connected-apps/connected-apps-page";
import { flushHookEffects, renderComponent } from "../render-hook";

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("@/features/connected-apps/api", () => ({
  listOAuthConnections: vi.fn(),
  revokeOAuthConnection: vi.fn()
}));

const user = {
  defaultFromMailboxId: null,
  email: "owner@example.com",
  id: "user_owner",
  name: "Owner",
  passwordSetupRequired: false as const,
  role: "owner" as const
};

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("connected apps", () => {
  it("shows the two delegated connection methods and current connections", async () => {
    vi.mocked(listOAuthConnections).mockResolvedValue([
      {
        clientId: "client_mail_helper",
        name: "Mail helper",
        scopes: ["mail:read", "mail:send"],
        resources: ["https://mail.example.com/api/v2"],
        createdAt: "2026-08-25T12:00:00.000Z",
        updatedAt: "2026-08-25T12:00:00.000Z"
      }
    ]);
    const view = await renderComponent(<ConnectedAppsPage user={user} />);
    document.body.appendChild(view.container);
    await flushHookEffects();

    expect(view.container.textContent).toContain("MCP");
    expect(view.container.textContent).toContain("Skill + API");
    expect(view.container.textContent).toContain("Your connections");
    expect(view.container.textContent).toContain("Mail helper");
    expect(view.container.textContent).toContain("Handle mail");
    expect(view.container.textContent).toContain("Mail API");
    expect(view.container.querySelector('[aria-label="Revoke Mail helper"]')).not.toBeNull();
    await view.unmount();
  });

  it("revokes a complete person-client connection after confirmation", async () => {
    vi.mocked(listOAuthConnections).mockResolvedValue([
      {
        clientId: "client_mail_helper",
        name: "Mail helper",
        scopes: ["mail:read"],
        resources: ["https://mail.example.com/mcp"],
        createdAt: "2026-08-25T12:00:00.000Z",
        updatedAt: "2026-08-25T12:00:00.000Z"
      }
    ]);
    vi.mocked(revokeOAuthConnection).mockResolvedValue();
    const view = await renderComponent(<ConnectedAppsPage user={user} />);
    document.body.appendChild(view.container);
    await flushHookEffects();

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Revoke Mail helper"]')?.click()
    );
    expect(document.body.textContent).toContain("Revoke connection?");
    const confirm = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Revoke"
    );
    await flushHookEffects(() => confirm?.click());

    expect(revokeOAuthConnection).toHaveBeenCalledWith("client_mail_helper");
    expect(view.container.textContent).not.toContain("Mail helper");
    expect(toastMocks.success).toHaveBeenCalledWith("Mail helper disconnected.");
    await view.unmount();
  });
});
