// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { McpSettings } from "@/features/mcp/mcp-settings";
import { flushHookEffects, renderComponent } from "../render-hook";

afterEach(() => {
  document.body.replaceChildren();
});

describe("AI connection settings", () => {
  it("shows two human connection methods and agentic creation paths", async () => {
    const view = await renderComponent(
      <McpSettings
        canManage
        domains={[{ id: "dom_example", name: "example.com", isEnabled: true }]}
        mailboxes={[]}
        onChanged={async () => undefined}
        user={{
          defaultFromMailboxId: null,
          email: "owner@example.com",
          id: "user_owner",
          name: "Owner",
          passwordSetupRequired: false,
          role: "owner"
        }}
      />
    );
    document.body.appendChild(view.container);
    await flushHookEffects();

    expect(view.container.textContent).toContain("MCP");
    expect(view.container.textContent).toContain("Skill + API");
    expect(view.container.textContent).toContain("or");
    expect(view.container.querySelector('[aria-label="Connection method"]')).toBeNull();

    const agenticMailbox = Array.from(view.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Agentic mailbox"
    );
    await flushHookEffects(() =>
      agenticMailbox?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0, ctrlKey: false })
      )
    );

    expect(view.container.textContent).toContain("Create mailbox agent");
    expect(view.container.textContent).toContain("Automate mailbox creation");
    expect(view.container.textContent).toContain("Create provisioner agent");
    await view.unmount();
  });
});
