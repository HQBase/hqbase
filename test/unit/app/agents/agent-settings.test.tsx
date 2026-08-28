// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSettings } from "@/features/agents/agent-settings";
import {
  createAgent,
  listAgents,
  rotateAgentCredential,
  setAgentActive
} from "@/features/agents/api";
import type { ManagedAgent } from "@/features/agents/types";
import { flushHookEffects, renderComponent } from "../render-hook";

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMocks }));

vi.mock("@/features/agents/api", () => ({
  createAgent: vi.fn(),
  listAgents: vi.fn(),
  rotateAgentCredential: vi.fn(),
  setAgentActive: vi.fn()
}));

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

describe("agent settings", () => {
  it("keeps mailbox agents separate from provisioning keys", async () => {
    vi.mocked(listAgents).mockResolvedValue([mailboxAgent, provisioner]);
    const view = await renderComponent(
      <AgentSettings
        domains={[{ id: "dom_example", name: "agents.example.com", isEnabled: true }]}
        mailboxes={[]}
        profile="mailbox"
        onChanged={async () => undefined}
      />
    );
    document.body.appendChild(view.container);
    await flushHookEffects();

    expect(view.container.textContent).toContain("Create mailbox agent");
    expect(view.container.textContent).toContain("Support assistant");
    expect(view.container.textContent).toContain("support@example.com");
    expect(view.container.textContent).toContain("Handle mail");
    expect(view.container.textContent).not.toContain("Browser provisioner");
    expect(view.container.textContent).toContain("Active");
    expect(
      view.container.querySelector('[aria-label="Actions for Support assistant"]')
    ).not.toBeNull();
    await view.unmount();
  });

  it("reactivates with a fresh credential and shows it once", async () => {
    vi.mocked(listAgents).mockResolvedValue([provisioner]);
    vi.mocked(setAgentActive).mockResolvedValue({
      agent: { ...provisioner, isActive: true },
      credential: "hqb_agent_reactivated"
    });
    const view = await renderComponent(
      <AgentSettings
        domains={[]}
        mailboxes={[]}
        profile="provisioner"
        onChanged={async () => undefined}
      />
    );
    document.body.appendChild(view.container);
    await flushHookEffects();

    const reactivate = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Reactivate"
    );
    await flushHookEffects(() => reactivate?.click());

    expect(setAgentActive).toHaveBeenCalledWith(provisioner.id, true);
    expect(document.body.textContent).toContain("Shown once");
    expect(
      document.body.querySelector<HTMLInputElement>('[aria-label="Agent credential"]')?.value
    ).toBe("hqb_agent_reactivated");
    expect(
      document.body.querySelector<HTMLInputElement>('[aria-label="Agent Skill URL"]')?.value
    ).toContain("/skills/hqbase-provisioner/SKILL.md");
    await view.unmount();
  });

  it("requires a human restore before a deleted mailbox agent can be used", async () => {
    vi.mocked(listAgents).mockResolvedValue([
      {
        ...mailboxAgent,
        isActive: false,
        mailbox: {
          id: "mbx_support",
          address: "support@example.com",
          displayName: "Support",
          isDeleted: true
        }
      }
    ]);
    const view = await renderComponent(
      <AgentSettings
        domains={[]}
        mailboxes={[]}
        profile="mailbox"
        onChanged={async () => undefined}
      />
    );
    document.body.appendChild(view.container);
    await flushHookEffects();

    expect(view.container.textContent).toContain("Mailbox deleted");
    expect(view.container.textContent).toContain("Restore mailbox first");
    expect(view.container.textContent).not.toContain("Reactivate");
    expect(view.container.querySelector('[aria-label="Actions for Support assistant"]')).toBeNull();
    expect(setAgentActive).not.toHaveBeenCalled();
    expect(rotateAgentCredential).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("confirms rotation before replacing the credential", async () => {
    vi.mocked(listAgents).mockResolvedValue([mailboxAgent]);
    vi.mocked(rotateAgentCredential).mockResolvedValue({
      agent: mailboxAgent,
      credential: "hqb_agent_rotated"
    });
    const view = await renderComponent(
      <AgentSettings
        domains={[]}
        mailboxes={[]}
        profile="mailbox"
        onChanged={async () => undefined}
      />
    );
    document.body.appendChild(view.container);
    await flushHookEffects();

    await flushHookEffects(() =>
      view.container
        .querySelector<HTMLButtonElement>('[aria-label="Actions for Support assistant"]')
        ?.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            button: 0,
            ctrlKey: false,
            pointerType: "mouse"
          })
        )
    );
    const rotateMenuItem = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
    ).find((item) => item.textContent?.includes("Rotate credential"));
    await flushHookEffects(() => rotateMenuItem?.click());
    expect(document.body.textContent).toContain("current credential will stop working immediately");

    const confirm = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Rotate credential"
    );
    await flushHookEffects(() => confirm?.click());

    expect(rotateAgentCredential).toHaveBeenCalledWith(mailboxAgent.id);
    expect(
      document.body.querySelector<HTMLInputElement>('[aria-label="Agent credential"]')?.value
    ).toBe("hqb_agent_rotated");
    expect(
      document.body.querySelector<HTMLInputElement>('[aria-label="Agent Skill URL"]')?.value
    ).toContain("/skills/hqbase-mailbox/SKILL.md");
    await view.unmount();
  });

  it("reports a failed workspace refresh after mailbox creation", async () => {
    vi.mocked(listAgents).mockResolvedValue([]);
    vi.mocked(createAgent).mockResolvedValue({
      agent: mailboxAgent,
      credential: "hqb_agent_created"
    });
    const onChanged = vi.fn().mockRejectedValue(new Error("Workspace refresh failed."));
    const view = await renderComponent(
      <AgentSettings domains={[]} mailboxes={[]} profile="mailbox" onChanged={onChanged} />
    );
    document.body.appendChild(view.container);
    await flushHookEffects();

    const create = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Create mailbox agent"
    );
    await flushHookEffects(() => create?.click());
    setInput(document.body, "#new-agent-name", "Support assistant");
    setInput(document.body, "#new-agent-mailbox-address", "support@example.com");
    setInput(document.body, "#new-agent-mailbox-name", "Support");
    await flushHookEffects(() => document.body.querySelector("form")?.requestSubmit());

    expect(
      document.body.querySelector<HTMLInputElement>('[aria-label="Agent Skill URL"]')?.value
    ).toContain("/skills/hqbase-mailbox/SKILL.md");

    const done = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Done"
    );
    await flushHookEffects(() => done?.click());

    expect(onChanged).toHaveBeenCalledOnce();
    expect(toastMocks.error).toHaveBeenCalledWith("Workspace refresh failed.");
    await view.unmount();
  });
});

function setInput(container: HTMLElement, selector: string, value: string): void {
  const input = container.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`Expected input ${selector}`);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setValue?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
