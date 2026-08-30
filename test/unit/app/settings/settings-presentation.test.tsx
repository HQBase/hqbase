import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DomainSettings } from "@/features/domains/domain-settings";
import { DomainTable } from "@/features/domains/domain-table";
import type { MailDomain } from "@/features/domains/types";
import { formatMailboxAccessSummary } from "@/features/mailbox-access/mailbox-access-policies";
import { MailboxSettings } from "@/features/mailboxes/mailbox-settings";
import { MailboxSelectionBar } from "@/features/mailboxes/mailbox-table";
import type { Mailbox } from "@/features/mailboxes/types";
import { SettingsPage } from "@/features/settings/settings-page";
import { RoleGuidanceCopy } from "@/features/users/role-guidance";
import type { WorkspaceUser } from "@/features/users/types";
import { UserSettings } from "@/features/users/user-settings";

const mailbox: Mailbox = {
  id: "mailbox-1",
  address: "support@example.com",
  mailDomainId: "domain-1",
  displayName: "Support",
  kind: "human",
  isActive: true,
  deletedAt: null,
  accessLevel: "manager",
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z"
};

const secondDomainMailbox: Mailbox = {
  ...mailbox,
  id: "mailbox-2",
  address: "privacy@example.net",
  mailDomainId: "domain-2",
  displayName: "Privacy"
};

const member: WorkspaceUser = {
  id: "user-1",
  name: "Avery Stone",
  email: "avery@example.com",
  role: "member",
  banned: false,
  createdAt: "2026-07-20T00:00:00.000Z",
  onboardingMethod: null,
  passwordSetupRequired: false,
  invitationSentAt: null
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
  disconnectedAt: null,
  updatedAt: "2026-07-20T00:00:00.000Z"
};
const setup = {
  isComplete: true,
  primaryDomain: "example.com",
  portalHostname: "mail.example.com",
  domains: [connectedDomain],
  userCount: 1,
  mailboxCount: 2,
  checklistAcknowledged: true
};
const notifications = {
  deviceState: "enabled" as const,
  disable: async () => undefined,
  enable: async () => undefined,
  error: null,
  isBusy: false,
  refresh: async () => ({
    latestInboundMessageId: null,
    unread: { catchall: 1, inbox: 2, inboxByMailbox: { "mailbox-1": 2 }, total: 3 },
    vapidPublicKey: "public-key"
  }),
  unread: { catchall: 1, inbox: 2, inboxByMailbox: { "mailbox-1": 2 }, total: 3 }
};

describe("settings presentation", () => {
  it("renders mailbox content at the top level and opens creation from a dialog trigger", () => {
    const html = renderToStaticMarkup(
      <MailboxSettings
        canManage
        defaultFromMailboxId={null}
        deletedMailboxes={[]}
        mailboxes={[]}
        users={[]}
        onChanged={async () => undefined}
        onDefaultFromMailboxChange={() => undefined}
      />
    );

    expect(html).toContain("<section");
    expect(html).toContain("Add mailbox");
    expect(html).toContain('class="relative w-full overflow-auto rounded-lg border"');
    expect(html).toContain("No mailboxes yet.");
    expect(html).not.toContain("Set access by domain");
    expect(html).not.toContain("support@example.com");
  });

  it("offers restore for deleted mailboxes while retention rules still apply", () => {
    const html = renderToStaticMarkup(
      <MailboxSettings
        canManage
        defaultFromMailboxId={null}
        deletedMailboxes={[{ ...mailbox, deletedAt: "2026-08-23T12:00:00.000Z" }]}
        mailboxes={[]}
        users={[]}
        onChanged={async () => undefined}
        onDefaultFromMailboxChange={() => undefined}
      />
    );

    expect(html).toContain("Deleted mailboxes");
    expect(html).toContain(
      "Restore a mailbox to make its stored mail available again. Retention rules still apply."
    );
    expect(html).toContain("support@example.com");
    expect(html).toContain("Restore");
  });

  it("keeps the user creation form out of the tab content", () => {
    const html = renderToStaticMarkup(
      <UserSettings
        currentUser={{ id: "owner-1", role: "owner" }}
        managedDomains={["example.com"]}
        users={[]}
        onChanged={() => undefined}
      />
    );

    expect(html).toContain("Add person");
    expect(html).toContain('class="relative w-full overflow-auto rounded-lg border"');
    expect(html).toContain("No people yet.");
    expect(html).toContain("Login email");
    expect(html).toContain('aria-label="About workspace roles"');
    expect(html).not.toContain("new-user-email");
  });

  it("shows pending onboarding state and the matching recovery action", () => {
    const html = renderToStaticMarkup(
      <UserSettings
        currentUser={{ id: "owner-1", role: "owner" }}
        managedDomains={["example.com"]}
        users={[
          {
            ...member,
            onboardingMethod: "email_invite",
            passwordSetupRequired: true,
            invitationSentAt: "2026-07-30T12:00:00.000Z"
          },
          {
            ...member,
            id: "user-2",
            email: "direct@gmail.com",
            onboardingMethod: "temporary_password",
            passwordSetupRequired: true
          }
        ]}
        onChanged={() => undefined}
      />
    );

    expect(html).toContain("Invite sent");
    expect(html).toContain("Password reset required");
    expect(html.match(/aria-label="Actions for Avery Stone"/gu)).toHaveLength(2);
  });

  it("shows removed users with a disabled role and a row actions menu", () => {
    const html = renderToStaticMarkup(
      <UserSettings
        currentUser={{ id: "owner-1", role: "owner" }}
        managedDomains={["example.com"]}
        users={[{ ...member, banned: true }]}
        onChanged={() => undefined}
      />
    );

    expect(html).toContain("Actions");
    expect(html).toContain("Removed");
    expect(html).toContain('aria-label="Actions for Avery Stone"');
    expect(html).toContain('aria-label="Role for Avery Stone"');
    expect(html).toContain("disabled");
  });

  it("explains workspace roles and mailbox grants", () => {
    const html = renderToStaticMarkup(<RoleGuidanceCopy />);

    expect(html).toContain("controls owner membership");
    expect(html).toContain("give themselves access to any mailbox");
    expect(html).toContain("cannot manage owners");
    expect(html).toContain("can access every mailbox");
    expect(html).not.toContain("Community");
    expect(html).not.toContain("Pro");
  });

  it("opens mailbox details from the compact access summary", () => {
    const html = renderToStaticMarkup(
      <MailboxSettings
        canManage
        defaultFromMailboxId={mailbox.id}
        deletedMailboxes={[]}
        mailboxes={[mailbox]}
        users={[member]}
        onChanged={async () => undefined}
        onDefaultFromMailboxChange={() => undefined}
      />
    );

    expect(html).toContain('class="relative w-full overflow-auto rounded-lg border"');
    expect(html).toContain('aria-label="Select all visible mailboxes"');
    expect(html).toContain("Default From mailbox");
    expect(html).toContain("Replies use the mailbox that received");
    expect(html).toContain('aria-label="Select support@example.com"');
    expect(html).not.toContain('aria-label="Filter mailboxes by domain"');
    expect(html).toContain(">Access<");
    expect(html).toContain("View access for support@example.com");
    expect(html).not.toContain(">Manage access<");
    expect(html).not.toContain("Apply to domain");
    expect(html).not.toContain("Set access by domain");
    expect(html).toContain('aria-label="support@example.com status"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
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
    ).toBe("Owners · Manager, Avery Stone · Handle mail");
  });

  it("shows the domain filter only when there are multiple domains", () => {
    const html = renderToStaticMarkup(
      <MailboxSettings
        canManage
        defaultFromMailboxId={mailbox.id}
        deletedMailboxes={[]}
        mailboxes={[mailbox, secondDomainMailbox]}
        users={[member]}
        onChanged={async () => undefined}
        onDefaultFromMailboxChange={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Filter mailboxes by domain"');
  });

  it("only shows one bulk action after mailbox selection", () => {
    expect(
      renderToStaticMarkup(<MailboxSelectionBar selectedCount={0} onManage={() => undefined} />)
    ).toBe("");

    const html = renderToStaticMarkup(
      <MailboxSelectionBar selectedCount={2} onManage={() => undefined} />
    );
    expect(html).toContain("2 selected");
    expect(html).toContain("Manage access for selected");
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("keeps domain additions in a modal and never asks for a Cloudflare credential", () => {
    const html = renderToStaticMarkup(
      <DomainSettings
        mailboxes={[]}
        portalHostname="mail.example.com"
        onChanged={() => undefined}
      />
    );

    expect(html).toContain("Connect domain");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("API token");
    expect(html).toContain('class="relative w-full overflow-auto rounded-lg border"');
    expect(html).toContain("No domains connected.");
    expect(html).toContain(">Save<");
    expect(html).not.toContain("Authorize and change portal");
    expect(html).not.toContain('href="/api/domains/cloudflare/oauth/start"');
  });

  it("renders connected domains in the compact settings table", () => {
    const html = renderToStaticMarkup(
      <DomainTable
        domains={[connectedDomain]}
        mailboxes={[mailbox]}
        pendingDomainId={null}
        portalHostname="mail.example.com"
        onCatchAllChange={() => undefined}
        onDisconnect={() => undefined}
        onForget={() => undefined}
        onRecheck={() => undefined}
        onReconnect={() => undefined}
        onToggle={() => undefined}
      />
    );

    expect(html).toContain(">Domain<");
    expect(html).toContain(">Readiness<");
    expect(html).toContain(">Unknown-address mail<");
    expect(html).toContain(">Active<");
    expect(html).toContain(">Actions<");
    expect(html).toContain("example.com");
    expect(html).toContain("Portal");
    expect(html).toContain("Send needs attention");
    expect(html).toContain("Reject unknown mail");
    expect(html).toContain('aria-label="example.com active in HQBase"');
    expect(html).toContain('aria-label="example.com unknown-address mail"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
  });

  it("shows the selected catch-all mailbox in its domain row", () => {
    const html = renderToStaticMarkup(
      <DomainTable
        domains={[{ ...connectedDomain, catchAllPolicy: "mailbox", catchAllMailboxId: mailbox.id }]}
        mailboxes={[mailbox]}
        pendingDomainId={null}
        portalHostname={null}
        onCatchAllChange={() => undefined}
        onDisconnect={() => undefined}
        onForget={() => undefined}
        onRecheck={() => undefined}
        onReconnect={() => undefined}
        onToggle={() => undefined}
      />
    );

    expect(html).toContain("Deliver to support@example.com");
    expect(html).not.toContain("Mail to unknown addresses");
  });

  it("shows a disconnected domain without active readiness controls", () => {
    const html = renderToStaticMarkup(
      <DomainTable
        domains={[
          {
            ...connectedDomain,
            catchAllPolicy: "reject",
            disconnectedAt: "2026-08-27T12:00:00.000Z",
            isEnabled: false,
            receivingStatus: "disabled",
            sendingStatus: "disabled"
          }
        ]}
        mailboxes={[mailbox]}
        pendingDomainId={null}
        portalHostname={null}
        onCatchAllChange={() => undefined}
        onDisconnect={() => undefined}
        onForget={() => undefined}
        onRecheck={() => undefined}
        onReconnect={() => undefined}
        onToggle={() => undefined}
      />
    );

    expect(html).toContain("Disconnected");
    expect(html).toContain('aria-label="Actions for example.com"');
    expect(html).toContain('aria-label="example.com active in HQBase"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("Send needs attention");
  });

  it("marks the mailbox selected as its domain catch-all", () => {
    const html = renderToStaticMarkup(
      <MailboxSettings
        canManage
        defaultFromMailboxId={mailbox.id}
        deletedMailboxes={[]}
        domains={[{ ...connectedDomain, catchAllPolicy: "mailbox", catchAllMailboxId: mailbox.id }]}
        mailboxes={[mailbox]}
        users={[]}
        onChanged={async () => undefined}
        onDefaultFromMailboxChange={() => undefined}
      />
    );

    expect(html).toContain("Catch-all for example.com");
  });

  it("combines appearance and notifications in Preferences", () => {
    const user = {
      id: "user-1",
      name: "Avery Stone",
      email: "avery@example.com",
      role: "owner" as const,
      passwordSetupRequired: false,
      defaultFromMailboxId: null as string | null
    };
    const html = renderToStaticMarkup(
      <SettingsPage
        activeTab="preferences"
        canManage
        currentUser={user as never}
        defaultFromMailboxId={null}
        deletedMailboxes={[]}
        mailboxes={[]}
        notifications={notifications}
        setup={setup}
        updateStatus={null}
        users={[]}
        onDefaultFromMailboxChange={() => undefined}
        onRefresh={async () => undefined}
        onUpdateStarted={() => undefined}
        onUpdateStatusChange={() => undefined}
        updateProgress={null}
      />
    );

    expect(html).toContain(">Appearance<");
    expect(html).toContain(">Notifications<");
    expect(html).toContain("Dark mode");
    expect(html).toContain("This device");
    expect(html).not.toContain(">Interface<");
    expect(html).not.toContain(">Debug<");
    expect(html).not.toContain('role="tablist"');
  });
});
