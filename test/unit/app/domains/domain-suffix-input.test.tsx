// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DomainSuffixInput,
  hasCompleteDomainSuffix,
  parseDomainSuffix
} from "@/features/domains/domain-suffix-input";
import { flushHookEffects, renderComponent } from "../render-hook";

const domains = [
  { id: "domain-example", name: "example.com" },
  { id: "domain-northstar", name: "northstar.example" }
];

afterEach(() => {
  document.body.replaceChildren();
});

describe("domain suffix input", () => {
  it("shows one available domain as a fixed suffix", async () => {
    const view = await renderComponent(
      <DomainSuffixInput
        domains={[{ id: "domain-example", name: "example.com" }]}
        id="mailbox-address"
        separator="@"
        value="support@example.com"
        onValueChange={() => undefined}
      />
    );

    expect(view.container.querySelector<HTMLInputElement>("#mailbox-address")?.value).toBe(
      "support"
    );
    expect(view.container.textContent).toContain("@example.com");
    expect(view.container.querySelector('[aria-label="Email domain"]')).toBeNull();
    await view.unmount();
  });

  it("joins the local part to a selected available domain", async () => {
    const onValueChange = vi.fn();
    const view = await renderComponent(
      <DomainSuffixInput
        domains={domains}
        id="mailbox-address"
        separator="@"
        value="support@example.com"
        onValueChange={onValueChange}
      />
    );
    document.body.appendChild(view.container);

    const trigger = view.container.querySelector<HTMLButtonElement>('[aria-label="Email domain"]');
    await flushHookEffects(() => {
      trigger?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      trigger?.click();
    });
    const option = [...document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
      (item) => item.textContent?.includes("northstar.example")
    );
    await flushHookEffects(() => {
      option?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      option?.click();
    });

    expect(onValueChange).toHaveBeenCalledWith("support@northstar.example");
    await view.unmount();
  });

  it("requires a prefix and an available domain", () => {
    expect(hasCompleteDomainSuffix("support@example.com", domains, "@")).toBe(true);
    expect(hasCompleteDomainSuffix("@example.com", domains, "@")).toBe(false);
    expect(hasCompleteDomainSuffix("support@elsewhere.example", domains, "@")).toBe(false);
  });

  it("uses the longest matching domain for nested workspace hosts", () => {
    expect(
      parseDomainSuffix(
        "mail.team.example.com",
        [
          { id: "example", name: "example.com" },
          { id: "team", name: "team.example.com" }
        ],
        "."
      )
    ).toEqual({ domain: { id: "team", name: "team.example.com" }, prefix: "mail" });
  });
});
