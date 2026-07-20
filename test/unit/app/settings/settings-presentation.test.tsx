import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DomainSettings } from "@/features/domains/domain-settings";
import { MailboxSettings } from "@/features/mailboxes/mailbox-settings";
import { SettingsPage } from "@/features/settings/settings-page";
import { UserSettings } from "@/features/users/user-settings";

const setup = {
  isComplete: true,
  primaryDomain: "example.com",
  portalHostname: "mail.example.com",
  serviceHostname: "bridge.example.com",
  domains: [{ id: "domain-1", name: "example.com", isEnabled: true }],
  userCount: 1,
  mailboxCount: 2,
  checklistAcknowledged: true
};

describe("settings presentation", () => {
  it("renders mailbox content at the top level and opens creation from a dialog trigger", () => {
    const html = renderToStaticMarkup(
      <MailboxSettings canManage mailboxes={[]} onChanged={() => undefined} />
    );

    expect(html).toContain("<section");
    expect(html).toContain("Add mailbox");
    expect(html).not.toContain("support@example.com");
  });

  it("keeps the user creation form out of the tab content", () => {
    const html = renderToStaticMarkup(<UserSettings users={[]} onChanged={() => undefined} />);

    expect(html).toContain("Add user");
    expect(html).not.toContain("new-user-email");
  });

  it("keeps domain additions in a modal and never asks for a Cloudflare credential", () => {
    const html = renderToStaticMarkup(
      <DomainSettings
        portalHostname="mail.example.com"
        serviceHostname="bridge.example.com"
        onChanged={() => undefined}
      />
    );

    expect(html).toContain("Connect domain");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("API token");
    expect(html).toContain("Authorize and change portal");
  });

  it("replaces General and Upgrade with Debug as the final tab", () => {
    const html = renderToStaticMarkup(
      <SettingsPage
        canManage
        defaultTab="mailboxes"
        entitlement={null}
        mailboxes={[]}
        setup={setup}
        updateStatus={null}
        upgrade={null}
        users={[]}
        onEntitlementChanged={() => undefined}
        onRefresh={() => undefined}
        onUpgradeChanged={() => undefined}
      />
    );

    expect(html).not.toContain(">General<");
    expect(html).not.toContain(">Upgrade<");
    expect(html).toContain(">Debug<");
    expect(html.indexOf(">Debug<")).toBeGreaterThan(html.indexOf(">Updates<"));
  });
});
