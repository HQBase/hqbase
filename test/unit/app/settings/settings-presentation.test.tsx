import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DomainSettings } from "@/features/domains/domain-settings";
import { DomainTable } from "@/features/domains/domain-table";
import type { MailDomain } from "@/features/domains/types";
import { formatMailboxAccessSummary } from "@/features/mailbox-access/mailbox-access-policies";
import { MailboxSettings } from "@/features/mailboxes/mailbox-settings";
import type { Mailbox } from "@/features/mailboxes/types";
import { SettingsPage } from "@/features/settings/settings-page";
import type { WorkspaceUser } from "@/features/users/types";
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

const mailbox: Mailbox = {
  id: "mailbox-1",
  address: "support@example.com",
  addresses: [],
  displayName: "Support",
  isActive: true,
  accessLevel: "manager",
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z"
};

const secondDomainMailbox: Mailbox = {
  ...mailbox,
  id: "mailbox-2",
  address: "privacy@example.net",
  displayName: "Privacy"
};

const member: WorkspaceUser = {
  id: "user-1",
  name: "Avery Stone",
  email: "avery@example.com",
  role: "member",
  banned: false,
  createdAt: "2026-07-20T00:00:00.000Z"
};

const connectedDomain: MailDomain = {
  id: "domain-1",
  name: "example.com",
  zoneId: "zone-1",
  accountId: "account-1",
  receivingStatus: "ready",
  sendingStatus: "degraded",
  dnsStatus: "pending",
  catchAllPolicy: "reject",
  catchAllMailboxId: null,
  isEnabled: true,
  updatedAt: "2026-07-20T00:00:00.000Z"
};

describe("settings presentation", () => {
  it("renders mailbox content at the top level and opens creation from a dialog trigger", () => {
    const html = renderToStaticMarkup(
      <MailboxSettings canManage mailboxes={[]} users={[]} onChanged={() => undefined} />
    );

    expect(html).toContain("<section");
    expect(html).toContain("Add mailbox");
    expect(html).toContain('class="relative w-full overflow-auto rounded-lg border"');
    expect(html).toContain("No mailboxes yet.");
    expect(html).not.toContain("Set access by domain");
    expect(html).not.toContain("support@example.com");
  });

  it("keeps the user creation form out of the tab content", () => {
    const html = renderToStaticMarkup(<UserSettings users={[]} onChanged={() => undefined} />);

    expect(html).toContain("Add user");
    expect(html).toContain('class="relative w-full overflow-auto rounded-lg border"');
    expect(html).toContain("No users yet.");
    expect(html).not.toContain("new-user-email");
  });

  it("centers mailbox access policy in each mailbox row", () => {
    const html = renderToStaticMarkup(
      <MailboxSettings
        canManage
        mailboxes={[mailbox]}
        users={[member]}
        onChanged={() => undefined}
      />
    );

    expect(html).toContain('class="relative w-full overflow-auto rounded-lg border"');
    expect(html).toContain('aria-label="Select all visible mailboxes"');
    expect(html).toContain('aria-label="Select support@example.com"');
    expect(html).not.toContain('aria-label="Filter mailboxes by domain"');
    expect(html).toContain(">Access<");
    expect(html).toContain("Manage access for support@example.com");
    expect(html).toContain(">Manage access<");
    expect(html).not.toContain("Apply to domain");
    expect(html).not.toContain("Set access by domain");
    expect(
      formatMailboxAccessSummary(
        mailbox.id,
        [
          {
            mailboxId: mailbox.id,
            userId: member.id,
            accessLevel: "agent",
            createdAt: "2026-07-20T00:00:00.000Z",
            updatedAt: "2026-07-20T00:00:00.000Z"
          }
        ],
        [member],
        false
      )
    ).toBe("Owner + 1 user");
  });

  it("shows the domain filter only when there are multiple domains", () => {
    const html = renderToStaticMarkup(
      <MailboxSettings
        canManage
        mailboxes={[mailbox, secondDomainMailbox]}
        users={[member]}
        onChanged={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Filter mailboxes by domain"');
  });

  it("keeps domain additions in a modal and never asks for a Cloudflare credential", () => {
    const html = renderToStaticMarkup(
      <DomainSettings portalHostname="mail.example.com" onChanged={() => undefined} />
    );

    expect(html).toContain("Connect domain");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("API token");
    expect(html).toContain('class="relative w-full overflow-auto rounded-lg border"');
    expect(html).toContain("No domains connected.");
    expect(html).toContain(">Save<");
    expect(html).not.toContain("Authorize and change portal");
    expect(html).not.toContain('href="/api/pro/domains/cloudflare/oauth/start"');
    expect(html).not.toContain("Bridge origin");
  });

  it("renders connected domains in the compact settings table", () => {
    const html = renderToStaticMarkup(
      <DomainTable domains={[connectedDomain]} pendingDomainId={null} onToggle={() => undefined} />
    );

    expect(html).toContain(">Domain<");
    expect(html).toContain(">Receive<");
    expect(html).toContain(">Send<");
    expect(html).toContain(">DNS<");
    expect(html).toContain(">Status<");
    expect(html).toContain("example.com");
    expect(html).toContain("Ready");
    expect(html).toContain("Degraded");
    expect(html).toContain("Pending");
    expect(html).toContain('aria-label="Disable example.com"');
  });

  it("replaces General and Upgrade with Debug as the final tab", () => {
    const html = renderToStaticMarkup(
      <SettingsPage
        activeTab="mailboxes"
        canManage
        entitlement={null}
        mailboxes={[]}
        setup={setup}
        updateStatus={null}
        upgrade={null}
        users={[]}
        onEntitlementChanged={() => undefined}
        onRefresh={() => undefined}
        onTabChange={() => undefined}
        onUpgradeChanged={() => undefined}
      />
    );

    expect(html).not.toContain(">General<");
    expect(html).not.toContain(">Upgrade<");
    expect(html).not.toContain('value="access"');
    expect(html).not.toContain("Mail clients");
    expect(html).toContain(">Debug<");
    expect(html).toContain('href="/settings/mailboxes"');
    expect(html).toContain('href="/settings/debug"');
    expect(html.indexOf(">Debug<")).toBeGreaterThan(html.indexOf(">Updates<"));
  });
});
