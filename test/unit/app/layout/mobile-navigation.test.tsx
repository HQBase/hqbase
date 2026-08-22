// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { flushHookEffects, renderComponent } from "../render-hook";

afterEach(() => {
  document.body.replaceChildren();
});

describe("mobile navigation", () => {
  it("keeps management permissions and routes to the selected settings tab", async () => {
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
          email: "owner@example.com",
          id: "user-1",
          name: "Owner",
          passwordSetupRequired: false,
          role: "owner"
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
    const domains = document.body.querySelector<HTMLAnchorElement>('a[href="/settings/domains"]');
    expect(domains).not.toBeNull();

    await flushHookEffects(() => domains?.click());
    expect(onSettingsTabChange).toHaveBeenCalledWith("domains");
    await view.unmount();
  });
});
