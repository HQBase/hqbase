// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { flushHookEffects, renderComponent } from "../render-hook";

afterEach(() => {
  document.body.replaceChildren();
});

describe("mobile navigation", () => {
  it("lets an admin open agent management", async () => {
    const onSettingsTabChange = vi.fn();
    const view = await renderComponent(
      <MobileNavigation
        activeFolder="settings"
        activeSettingsTab="users"
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
        onFolderChange={() => undefined}
        onMailboxChange={() => undefined}
        onSettingsTabChange={onSettingsTabChange}
        onSignedOut={() => undefined}
      />
    );
    document.body.appendChild(view.container);

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')?.click()
    );
    const agents = document.body.querySelector<HTMLAnchorElement>('a[href="/settings/agents"]');
    expect(agents).not.toBeNull();

    await flushHookEffects(() => agents?.click());
    expect(onSettingsTabChange).toHaveBeenCalledWith("agents");
    await view.unmount();
  });

  it("hides agent management from workspace members", async () => {
    const view = await renderComponent(
      <MobileNavigation
        activeFolder="settings"
        activeSettingsTab="users"
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
        onSettingsTabChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );
    document.body.appendChild(view.container);

    await flushHookEffects(() =>
      view.container.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')?.click()
    );
    expect(document.body.querySelector('a[href="/settings/agents"]')).toBeNull();
    expect(document.body.querySelector('a[href="/settings/domains"]')).toBeNull();
    expect(document.body.querySelector('a[href="/settings/users"]')).not.toBeNull();
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
      document.body.querySelector<HTMLButtonElement>('[aria-label="Mailbox filter"]')?.click()
    );

    expect(document.body.textContent).toContain("support@example.com");
    expect(document.body.textContent).not.toContain("support@example.com (4)");
    await view.unmount();
  });
});
