// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { flushHookEffects, renderComponent } from "../render-hook";

afterEach(() => {
  document.body.replaceChildren();
});

describe("mobile navigation", () => {
  it("opens the single Agents destination", async () => {
    const onFolderChange = vi.fn();
    const view = await renderComponent(
      <MobileNavigation
        activeFolder="agents"
        canManage
        draftCount={0}
        mailboxId="all"
        mailboxes={[]}
        unread={{ catchall: 0, inbox: 0, inboxByMailbox: {}, total: 0 }}
        user={{
          defaultFromMailboxId: null,
          email: "admin@example.com",
          id: "user-1",
          name: "Admin",
          passwordSetupRequired: false,
          role: "admin"
        }}
        onFolderChange={onFolderChange}
        onMailboxChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );
    document.body.appendChild(view.container);

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')?.click()
    );
    const agents = document.body.querySelector<HTMLAnchorElement>('a[href="/agents"]');
    expect(agents).not.toBeNull();

    await flushHookEffects(() => agents?.click());
    expect(onFolderChange).toHaveBeenCalledWith("agents");
    await view.unmount();
  });

  it("keeps the drawer open for a section switch and closes it for a destination", async () => {
    const onFolderChange = vi.fn();
    const navigation = (activeFolder: "contacts" | "inbox") => (
      <MobileNavigation
        activeFolder={activeFolder}
        draftCount={0}
        mailboxId="all"
        mailboxes={[]}
        unread={{ catchall: 0, inbox: 0, inboxByMailbox: {}, total: 0 }}
        user={{
          defaultFromMailboxId: null,
          email: "member@example.com",
          id: "user-2",
          name: "Member",
          passwordSetupRequired: false,
          role: "member"
        }}
        onFolderChange={onFolderChange}
        onMailboxChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );
    const view = await renderComponent(navigation("inbox"));
    document.body.appendChild(view.container);

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')?.click()
    );
    const drawer = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(drawer()?.getAttribute("data-state")).toBe("open");
    expect(drawer()?.classList.contains("border-r-0")).toBe(true);
    expect(drawer()?.classList.contains("!bg-transparent")).toBe(false);
    expect(drawer()?.classList.contains("shadow-none")).toBe(true);

    await flushHookEffects(() =>
      document.body
        .querySelector<HTMLAnchorElement>('nav[aria-label="Quick access"] a[aria-label="Contacts"]')
        ?.click()
    );
    expect(onFolderChange).toHaveBeenLastCalledWith("contacts");
    expect(drawer()?.getAttribute("data-state")).toBe("open");

    await view.rerender(navigation("contacts"));
    const allContacts = document.body.querySelector<HTMLAnchorElement>(
      'nav[aria-label="Contacts navigation"] a[href="/contacts"]'
    );
    expect(allContacts).not.toBeNull();
    await flushHookEffects(() => allContacts?.click());
    expect(onFolderChange).toHaveBeenLastCalledWith("contacts");
    expect(drawer()?.getAttribute("data-state")).not.toBe("open");
    await view.unmount();
  });

  it("shows one Agents destination to workspace members", async () => {
    const view = await renderComponent(
      <MobileNavigation
        activeFolder="agents"
        canManage={false}
        draftCount={0}
        mailboxId="all"
        mailboxes={[]}
        unread={{ catchall: 0, inbox: 0, inboxByMailbox: {}, total: 0 }}
        user={{
          defaultFromMailboxId: null,
          email: "member@example.com",
          id: "user-2",
          name: "Member",
          passwordSetupRequired: false,
          role: "member"
        }}
        onFolderChange={() => undefined}
        onMailboxChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );
    document.body.appendChild(view.container);

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')?.click()
    );
    expect(document.body.querySelector('a[href="/agents"]')).not.toBeNull();
    expect(document.body.textContent).toContain("All connections");
    expect(document.body.querySelector('a[href="/agents/mailboxes"]')).toBeNull();
    await view.unmount();
  });

  it("keeps unread counts out of the compact mailbox selector", async () => {
    const view = await renderComponent(
      <MobileNavigation
        activeFolder="inbox"
        draftCount={0}
        mailboxId="mailbox-1"
        mailboxes={[
          {
            accessLevel: "manager",
            address: "support@example.com",
            createdAt: "2026-08-24T12:00:00.000Z",
            deletedAt: null,
            displayName: "Support",
            id: "mailbox-1",
            isActive: true,
            kind: "human",
            mailDomainId: "domain-1",
            updatedAt: "2026-08-24T12:00:00.000Z"
          }
        ]}
        unread={{
          catchall: 0,
          inbox: 4,
          inboxByMailbox: { "mailbox-1": 4 },
          total: 4
        }}
        user={{
          defaultFromMailboxId: null,
          email: "member@example.com",
          id: "user-2",
          name: "Member",
          passwordSetupRequired: false,
          role: "member"
        }}
        onFolderChange={() => undefined}
        onMailboxChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );
    document.body.appendChild(view.container);

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')?.click()
    );
    await flushHookEffects(() =>
      document.body
        .querySelector<HTMLButtonElement>('[aria-label="Mailbox filter"]')
        ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
    );

    expect(document.body.textContent).toContain("support@example.com");
    expect(document.body.textContent).not.toContain("support@example.com (4)");
    await view.unmount();
  });

  it("dismisses the mailbox selector without closing the drawer", async () => {
    const onMailboxChange = vi.fn();
    const view = await renderComponent(
      <MobileNavigation
        activeFolder="inbox"
        draftCount={0}
        mailboxId="all"
        mailboxes={[
          {
            accessLevel: "manager",
            address: "support@example.com",
            createdAt: "2026-08-24T12:00:00.000Z",
            deletedAt: null,
            displayName: "Support",
            id: "mailbox-1",
            isActive: true,
            kind: "human",
            mailDomainId: "domain-1",
            updatedAt: "2026-08-24T12:00:00.000Z"
          }
        ]}
        unread={{ catchall: 0, inbox: 0, inboxByMailbox: {}, total: 0 }}
        user={{
          defaultFromMailboxId: null,
          email: "member@example.com",
          id: "user-2",
          name: "Member",
          passwordSetupRequired: false,
          role: "member"
        }}
        onFolderChange={() => undefined}
        onMailboxChange={onMailboxChange}
        onSignedOut={() => undefined}
      />
    );
    document.body.appendChild(view.container);

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')?.click()
    );
    await flushHookEffects(() =>
      document.body
        .querySelector<HTMLButtonElement>('[aria-label="Mailbox filter"]')
        ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
    );
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    await flushHookEffects(() => {
      const destination = document.body.querySelector<HTMLAnchorElement>(
        'nav[aria-label="Mail folders"] a[href="/mail/sent"]'
      );
      destination?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      destination?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      destination?.click();
    });

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute("data-state")).toBe("open");

    await flushHookEffects(() =>
      document.body
        .querySelector<HTMLButtonElement>('[aria-label="Mailbox filter"]')
        ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }))
    );
    const supportMailbox = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]')
    ).find((item) => item.textContent?.includes("support@example.com"));
    await flushHookEffects(() => supportMailbox?.click());

    expect(onMailboxChange).toHaveBeenCalledWith("mailbox-1");
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute("data-state")).not.toBe(
      "open"
    );
    await view.unmount();
  });
});
