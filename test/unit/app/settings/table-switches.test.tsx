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
      <DomainTable domains={[domain]} pendingDomainId={pendingDomainId} onToggle={onToggle} />
    );
    const view = await renderComponent(table(null));
    const control = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="example.com enabled"]'
    );

    expect(control?.getAttribute("role")).toBe("switch");
    expect(control?.getAttribute("aria-checked")).toBe("true");
    await flushHookEffects(() => control?.click());
    expect(onToggle).toHaveBeenCalledWith(domain, false);

    await view.rerender(table("domain-2"));
    expect(
      view.container.querySelector<HTMLButtonElement>('[aria-label="example.com enabled"]')
        ?.disabled
    ).toBe(true);
    await view.unmount();
  });
});
