// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog";
import { AgentCreateForm } from "@/features/agents/agent-create-dialog";
import { createAgent } from "@/features/agents/api";
import type { Mailbox } from "@/features/mailboxes/types";
import { flushHookEffects, renderComponent } from "../render-hook";

vi.mock("@/features/agents/api", () => ({ createAgent: vi.fn() }));

const mailbox: Mailbox = {
  id: "mbx_support",
  address: "support@example.com",
  mailDomainId: "dom_example",
  displayName: "Support",
  kind: "human",
  isActive: true,
  deletedAt: null,
  accessLevel: "manager",
  createdAt: "2026-08-23T12:00:00.000Z",
  updatedAt: "2026-08-23T12:00:00.000Z"
};

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("agent creation form", () => {
  it("warns that a mailbox agent can read the full mailbox", async () => {
    const view = await renderComponent(
      <Dialog>
        <AgentCreateForm
          domains={[{ id: "dom_example", name: "example.com", isEnabled: true }]}
          mailboxes={[mailbox]}
          profile="mailbox"
          onCreated={() => undefined}
        />
      </Dialog>
    );

    expect(view.container.textContent).toContain("Create mailbox agent");
    expect(view.container.textContent).toContain("Full mailbox access");
    expect(view.container.textContent).toContain("all current and future mail");
    expect(view.container.textContent).toContain("Handle mail");
    await view.unmount();
  });

  it("explains the provisioner's credential and delegation boundary", async () => {
    const view = await renderComponent(
      <Dialog>
        <AgentCreateForm
          domains={[{ id: "dom_example", name: "example.com", isEnabled: true }]}
          mailboxes={[mailbox]}
          profile="provisioner"
          onCreated={() => undefined}
        />
      </Dialog>
    );

    expect(view.container.textContent).toContain("Allowed domain");
    expect(view.container.textContent).toContain("Mailbox limit");
    expect(view.container.textContent).toContain("Trusted provisioning");
    expect(view.container.textContent).toContain("receives each new mailbox agent credential");
    expect(view.container.textContent).toContain("own credential cannot call the Mail API");
    expect(view.container.textContent).toContain("trusted control-plane service");
    await view.unmount();
  });

  it("opens a provisioner-only form from the connection guide", async () => {
    const view = await renderComponent(
      <Dialog>
        <AgentCreateForm
          domains={[{ id: "dom_example", name: "example.com", isEnabled: true }]}
          mailboxes={[mailbox]}
          profile="provisioner"
          onCreated={() => undefined}
        />
      </Dialog>
    );

    expect(view.container.querySelector('[role="tablist"]')).toBeNull();
    expect(view.container.textContent).toContain("Create provisioning key");
    expect(view.container.textContent).toContain("Allowed domain");
    expect(view.container.textContent).toContain("Trusted provisioning");
    await view.unmount();
  });

  it("submits the default read-only profile for a new exact mailbox", async () => {
    vi.mocked(createAgent).mockResolvedValue({
      agent: {
        id: "agt_support",
        name: "Support assistant",
        profile: "mailbox",
        isActive: true,
        accessLevel: "read",
        mailbox: {
          id: "mbx_support",
          address: "support@example.com",
          displayName: "Support",
          isDeleted: false
        },
        createdAt: "2026-08-23T12:00:00.000Z",
        updatedAt: "2026-08-23T12:00:00.000Z"
      },
      credential: "hqb_agent_secret"
    });
    const onCreated = vi.fn();
    const view = await renderComponent(
      <Dialog>
        <AgentCreateForm
          domains={[{ id: "dom_example", name: "example.com", isEnabled: true }]}
          mailboxes={[]}
          profile="mailbox"
          onCreated={onCreated}
        />
      </Dialog>
    );
    document.body.appendChild(view.container);

    setInput(view.container, "#new-agent-name", " Support assistant ");
    setInput(view.container, "#new-agent-mailbox-address", "Support");
    setInput(view.container, "#new-agent-mailbox-name", " Support ");
    await flushHookEffects(() => view.container.querySelector("form")?.requestSubmit());

    expect(createAgent).toHaveBeenCalledWith({
      profile: "mailbox",
      name: "Support assistant",
      accessLevel: "read",
      mailbox: { address: "support@example.com", displayName: "Support" }
    });
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ credential: "hqb_agent_secret" })
    );
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
