// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DomainTable } from "@/features/domains/domain-table";
import type { MailDomain } from "@/features/domains/types";
import type { MailboxAccessPolicies } from "@/features/mailbox-access/mailbox-access-policies";
import { MailboxTable } from "@/features/mailboxes/mailbox-table";
import type { Mailbox } from "@/features/mailboxes/types";
import { flushHookEffects, renderComponent } from "../render-hook";

const mailbox: Mailbox = {
  id: "mailbox-1",
  address: "support@example.com",
  mailDomainId: "domain-1",
  displayName: "Support",
  kind: "human",
  isActive: true,
  deletedAt: null,
  accessLevel: "manager",
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z"
};

const domain: MailDomain = {
  id: "domain-1",
  name: "example.com",
  zoneId: "zone-1",
  accountId: "account-1",
  receivingStatus: "ready",
  sendingStatus: "ready",
  dnsStatus: "ready",
  catchAllPolicy: "reject",
  catchAllMailboxId: null,
  isEnabled: true,
  disconnectedAt: null,
  updatedAt: "2026-08-23T00:00:00.000Z"
};

const policies: MailboxAccessPolicies = {
  grants: [],
  busy: null,
  loading: false,
  applyMany: async () => false,
  change: async () => undefined
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("settings table switches", () => {
  it("toggles a mailbox without opening its details sheet and disables pending changes", async () => {
    const onOpenDetails = vi.fn();
    const onToggle = vi.fn();
    const table = (pendingMailboxId: string | null) => (
      <MailboxTable
        canManage
        mailboxes={[mailbox]}
        pendingMailboxId={pendingMailboxId}
        policies={policies}
        selectedIds={[]}
        users={[]}
        onOpenDetails={onOpenDetails}
        onSelectionChange={() => undefined}
        onToggle={onToggle}
      />
    );
    const view = await renderComponent(table(null));
    const control = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="support@example.com status"]'
    );

    expect(control?.getAttribute("role")).toBe("switch");
    expect(control?.getAttribute("aria-checked")).toBe("true");
    await flushHookEffects(() => control?.click());
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith(mailbox, false);
    expect(onOpenDetails).not.toHaveBeenCalled();

    onToggle.mockClear();
    await view.rerender(table("mailbox-2"));
    const pendingControl = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="support@example.com status"]'
    );
    expect(pendingControl?.disabled).toBe(true);
    await flushHookEffects(() => pendingControl?.click());
    expect(onToggle).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("passes the requested domain state and disables a pending row", async () => {
    const onToggle = vi.fn();
    const table = (pendingDomainId: string | null) => (
      <DomainTable
        domains={[domain, { ...domain, id: "domain-2", name: "second.example.com" }]}
        mailboxes={[mailbox]}
        pendingDomainId={pendingDomainId}
        portalHostname={null}
        onCatchAllChange={() => undefined}
        onDisconnect={() => undefined}
        onForget={() => undefined}
        onRecheck={() => undefined}
        onReconnect={() => undefined}
        onToggle={onToggle}
      />
    );
    const view = await renderComponent(table(null));
    const control = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="example.com active in HQBase"]'
    );

    expect(control?.getAttribute("role")).toBe("switch");
    expect(control?.getAttribute("aria-checked")).toBe("true");
    await flushHookEffects(() => control?.click());
    expect(onToggle).toHaveBeenCalledWith(domain, false);

    await view.rerender(table("domain-2"));
    expect(
      view.container.querySelector<HTMLButtonElement>('[aria-label="example.com active in HQBase"]')
        ?.disabled
    ).toBe(false);
    expect(
      view.container.querySelector<HTMLButtonElement>(
        '[aria-label="second.example.com active in HQBase"]'
      )?.disabled
    ).toBe(true);
    await view.unmount();
  });

  it("saves one catch-all policy choice for the domain", async () => {
    const onChange = vi.fn();
    const view = await renderComponent(
      <DomainTable
        domains={[domain]}
        mailboxes={[mailbox]}
        pendingDomainId={null}
        portalHostname={null}
        onCatchAllChange={onChange}
        onDisconnect={() => undefined}
        onForget={() => undefined}
        onRecheck={() => undefined}
        onReconnect={() => undefined}
        onToggle={() => undefined}
      />
    );
    const selector = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="example.com unknown-address mail"]'
    );

    await flushHookEffects(() => {
      selector?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      selector?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });
    const ownerReview = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
    ).find((item) => item.textContent?.includes("Keep for owner review"));
    await flushHookEffects(() => {
      ownerReview?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      ownerReview?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });

    expect(onChange).toHaveBeenCalledWith(domain, "unassigned", null);
    await view.unmount();
  });

  it("opens the connected-domain lifecycle action from the table row", async () => {
    const onDisconnect = vi.fn();
    const view = await renderComponent(
      <DomainTable
        domains={[domain]}
        mailboxes={[mailbox]}
        pendingDomainId={null}
        portalHostname={null}
        onCatchAllChange={() => undefined}
        onDisconnect={onDisconnect}
        onForget={() => undefined}
        onRecheck={() => undefined}
        onReconnect={() => undefined}
        onToggle={() => undefined}
      />
    );
    const actions = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Actions for example.com"]'
    );

    await flushHookEffects(() => {
      actions?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      actions?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });
    const disconnect = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
    ).find((item) => item.textContent?.includes("Disconnect domain"));
    await flushHookEffects(() => {
      disconnect?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      disconnect?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });

    expect(onDisconnect).toHaveBeenCalledWith(domain);
    await view.unmount();
  });
});
