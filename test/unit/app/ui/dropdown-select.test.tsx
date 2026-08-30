// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { DropdownSelect } from "@/components/ui/dropdown-select";
import { flushHookEffects, renderComponent } from "../render-hook";

afterEach(() => {
  document.body.replaceChildren();
});

describe("dropdown select", () => {
  it("shows the selected option and reports a new radio choice", async () => {
    const onValueChange = vi.fn();
    const view = await renderComponent(
      <DropdownSelect
        ariaLabel="Access"
        options={[
          { label: "Read", value: "read" },
          { label: "Manager", value: "manager" }
        ]}
        value="read"
        onValueChange={onValueChange}
      />
    );

    const trigger = view.container.querySelector<HTMLButtonElement>('[aria-label="Access"]');
    expect(trigger?.textContent).toContain("Read");
    expect(trigger?.className).toContain("h-[34px]");
    expect(trigger?.className).toContain("min-h-[34px]");
    expect(trigger?.className).toContain("rounded-[calc(var(--radius)+2px)]");

    await flushHookEffects(() => {
      trigger?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });
    const manager = [...document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
      (item) => item.textContent?.includes("Manager")
    );
    expect(manager).toBeDefined();
    await flushHookEffects(() => {
      manager?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      manager?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });

    expect(onValueChange).toHaveBeenCalledWith("manager");
    await view.unmount();
  });

  it("disables its trigger", async () => {
    const view = await renderComponent(
      <DropdownSelect
        ariaLabel="Mailbox"
        disabled
        options={[{ label: "Support", value: "support" }]}
        value="support"
        onValueChange={() => undefined}
      />
    );

    expect(
      view.container.querySelector<HTMLButtonElement>('[aria-label="Mailbox"]')?.disabled
    ).toBe(true);
    await view.unmount();
  });

  it("offers a compact dropdown height", async () => {
    const view = await renderComponent(
      <DropdownSelect
        ariaLabel="Compact access"
        options={[{ label: "Read", value: "read" }]}
        size="sm"
        value="read"
        onValueChange={() => undefined}
      />
    );

    const trigger = view.container.querySelector('[aria-label="Compact access"]');
    expect(trigger?.className).toContain("h-[30px]");
    expect(trigger?.className).toContain("min-h-[30px]");
    await view.unmount();
  });
});
