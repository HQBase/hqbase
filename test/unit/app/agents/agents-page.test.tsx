// @vitest-environment happy-dom
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentsPage } from "@/features/agents/agents-page";
import { listAgents, rotateAgentCredential, setAgentActive } from "@/features/agents/api";
import type { ManagedAgent } from "@/features/agents/types";
import { listOAuthConnections, revokeOAuthConnection } from "@/features/connected-apps/api";
import { flushHookEffects, renderComponent } from "../render-hook";

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("@/features/agents/api", () => ({
  createAgent: vi.fn(),
  listAgents: vi.fn(),
  rotateAgentCredential: vi.fn(),
  setAgentActive: vi.fn()
}));
vi.mock("@/features/connected-apps/api", () => ({
  listOAuthConnections: vi.fn(),
  revokeOAuthConnection: vi.fn()
}));

const owner = {
  defaultFromMailboxId: null,
  email: "owner@example.com",
  id: "user_owner",
  name: "Owner",
  passwordSetupRequired: false as const,
  role: "owner" as const
};

const oauthConnection = {
  clientId: "client_mail_helper",
  name: "Mail helper",
  scopes: ["mail:read", "mail:send"],
  resources: ["https://mail.example.com/mcp/full"],
  createdAt: "2026-08-25T12:00:00.000Z",
  updatedAt: "2026-08-25T12:00:00.000Z"
};

const mailboxAgent: ManagedAgent = {
  id: "agt_support",
  name: "Support assistant",
  profile: "mailbox",
  isActive: true,
  accessLevel: "agent",
  mailbox: {
    id: "mbx_support",
    address: "support@example.com",
    displayName: "Support",
    isDeleted: false
  },
  createdAt: "2026-08-23T12:00:00.000Z",
  updatedAt: "2026-08-23T12:00:00.000Z"
};

const provisioner: ManagedAgent = {
  id: "agt_provisioner",
  name: "Browser provisioner",
  profile: "provisioner",
  isActive: false,
  mailDomain: { id: "dom_example", domain: "agents.example.com" },
  mailboxLimit: 20,
  mailboxCount: 3,
  createdAt: "2026-08-23T12:00:00.000Z",
  updatedAt: "2026-08-23T12:00:00.000Z"
};

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("Agents page", () => {
  it("shows delegated and machine connections in one status list", async () => {
    vi.mocked(listOAuthConnections).mockResolvedValue([oauthConnection]);
    vi.mocked(listAgents).mockResolvedValue([mailboxAgent, provisioner]);
    const view = await renderPage();

    expect(view.container.textContent).toContain("All connections");
    expect(view.container.textContent).toContain("Mail helper");
    expect(view.container.textContent).toContain("Authorized");
    expect(view.container.textContent).toContain("Support assistant");
    expect(view.container.textContent).toContain("Enabled");
    expect(view.container.textContent).toContain("Browser provisioner");
    expect(view.container.textContent).toContain("Disabled");
    expect(view.container.textContent).toContain("3 of 20 mailboxes");
    expect(
      view.container.querySelector('[aria-label="Actions for Support assistant"]')
    ).not.toBeNull();
    await view.unmount();
  });

  it("limits a workspace member to personal connections and the assistant choice", async () => {
    vi.mocked(listOAuthConnections).mockResolvedValue([oauthConnection]);
    const view = await renderPage({
      canManage: false,
      user: { ...owner, id: "user_member", role: "member" }
    });

    expect(listAgents).not.toHaveBeenCalled();
    await flushHookEffects(() => clickButton(view.container, "Add connection"));
    expect(document.body.textContent).toContain("AI assistant");
    expect(document.body.textContent).not.toContain("Automation with its own mailbox");
    expect(document.body.textContent).not.toContain("Provisioning key");
    await flushHookEffects(() => clickButton(document.body, "AI assistant"));
    expect(document.body.textContent).toContain("Connect an AI assistant");
    expect(document.body.textContent).toContain("Server profile");
    await flushHookEffects(() => clickButton(document.body, "Back"));
    expect(document.body.textContent).toContain("Choose how the software will access HQBase");
    await view.unmount();
  });

  it("returns to saved setup instructions and confirms credential rotation", async () => {
    vi.mocked(listOAuthConnections).mockResolvedValue([]);
    vi.mocked(listAgents).mockResolvedValue([mailboxAgent]);
    vi.mocked(rotateAgentCredential).mockResolvedValue({
      agent: mailboxAgent,
      credential: "hqb_agent_rotated"
    });
    const view = await renderPage();

    await openAgentMenu(view.container, mailboxAgent.name);
    await flushHookEffects(() => clickMenuItem("Setup instructions"));
    expect(document.body.textContent).toContain("Use the saved credential");
    expect(document.body.textContent).toContain("cannot show the credential again");
    expect(
      document.body.querySelector<HTMLInputElement>('[aria-label="Agent Skill URL"]')?.value
    ).toContain("/skills/hqbase-mailbox/SKILL.md");
    expect(
      document.body.querySelector<HTMLAnchorElement>('a[href*="connect-a-machine-identity"]')
    ).not.toBeNull();

    await flushHookEffects(() => clickButton(document.body, "Rotate credential"));
    expect(document.body.textContent).toContain("current credential will stop working immediately");
    await flushHookEffects(() => clickButton(document.body, "Rotate credential"));
    expect(rotateAgentCredential).toHaveBeenCalledWith(mailboxAgent.id);
    expect(
      document.body.querySelector<HTMLInputElement>('[aria-label="Agent credential"]')?.value
    ).toBe("hqb_agent_rotated");
    await view.unmount();
  });

  it("enables a disabled identity with a fresh one-time credential", async () => {
    vi.mocked(listOAuthConnections).mockResolvedValue([]);
    vi.mocked(listAgents).mockResolvedValue([provisioner]);
    vi.mocked(setAgentActive).mockResolvedValue({
      agent: { ...provisioner, isActive: true },
      credential: "hqb_agent_enabled"
    });
    const view = await renderPage();

    await openAgentMenu(view.container, provisioner.name);
    await flushHookEffects(() => clickMenuItem("Enable"));
    expect(setAgentActive).toHaveBeenCalledWith(provisioner.id, true);
    expect(document.body.textContent).toContain("Shown once");
    expect(
      document.body.querySelector<HTMLInputElement>('[aria-label="Agent credential"]')?.value
    ).toBe("hqb_agent_enabled");
    await view.unmount();
  });

  it("keeps recovery instructions available for a deleted mailbox", async () => {
    const deletedAgent = {
      ...mailboxAgent,
      isActive: false,
      mailbox: {
        id: "mbx_support",
        address: "support@example.com",
        displayName: "Support",
        isDeleted: true
      }
    };
    vi.mocked(listOAuthConnections).mockResolvedValue([]);
    vi.mocked(listAgents).mockResolvedValue([deletedAgent]);
    const view = await renderPage();

    expect(view.container.textContent).toContain("Mailbox deleted");
    await openAgentMenu(view.container, deletedAgent.name);
    expect(document.body.textContent).toContain("Setup instructions");
    expect(document.body.textContent).not.toContain("Enable");
    expect(document.body.textContent).not.toContain("Rotate credential");
    await flushHookEffects(() => clickMenuItem("Setup instructions"));
    expect(document.body.textContent).toContain("Restore the mailbox first");
    expect(setAgentActive).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("revokes a delegated connection after confirmation", async () => {
    vi.mocked(listOAuthConnections).mockResolvedValue([oauthConnection]);
    vi.mocked(listAgents).mockResolvedValue([]);
    vi.mocked(revokeOAuthConnection).mockResolvedValue();
    const view = await renderPage();

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Revoke Mail helper"]')?.click()
    );
    expect(document.body.textContent).toContain("Revoke connection?");
    await flushHookEffects(() => clickButton(document.body, "Revoke"));
    expect(revokeOAuthConnection).toHaveBeenCalledWith(oauthConnection.clientId);
    expect(view.container.textContent).not.toContain("Mail helper");
    expect(toastMocks.success).toHaveBeenCalledWith("Mail helper disconnected.");
    await view.unmount();
  });
});

async function renderPage(
  overrides: Partial<React.ComponentProps<typeof AgentsPage>> = {}
): Promise<Awaited<ReturnType<typeof renderComponent>>> {
  const view = await renderComponent(
    <AgentsPage
      canManage
      domains={[{ id: "dom_example", name: "agents.example.com", isEnabled: true }]}
      mailboxes={[]}
      user={owner}
      onChanged={async () => undefined}
      {...overrides}
    />
  );
  document.body.appendChild(view.container);
  await flushHookEffects();
  return view;
}

async function openAgentMenu(container: HTMLElement, name: string): Promise<void> {
  await flushHookEffects(() =>
    container.querySelector<HTMLButtonElement>(`[aria-label="Actions for ${name}"]`)?.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        ctrlKey: false,
        pointerType: "mouse"
      })
    )
  );
}

function clickButton(container: Element | Document, label: string): void {
  Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.trim().startsWith(label))
    ?.click();
}

function clickMenuItem(label: string): void {
  Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((item) => item.textContent?.includes(label))
    ?.click();
}
