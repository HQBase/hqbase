import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { LoginPage } from "@/features/auth/login-page";
import { ComposeWindow } from "@/features/compose/compose-window";
import { DraftsPage } from "@/features/drafts/drafts-page";
import { InboxPage } from "@/features/inbox/inbox-page";
import type { Mailbox } from "@/features/mailboxes/types";
import { McpConnectionDetails } from "@/features/mcp/connection-dialog";

const user = {
  defaultFromMailboxId: "mailbox-1",
  id: "user-1",
  email: "olivia@example.com",
  name: "Olivia Berman",
  passwordSetupRequired: false,
  role: "owner" as const
};
const unread = {
  catchall: 2,
  inbox: 7,
  inboxByMailbox: { "mailbox-1": 4, "mailbox-2": 3 },
  total: 9
};
const mailbox: Mailbox = {
  id: "mailbox-1",
  address: "support@example.com",
  mailDomainId: "domain-1",
  displayName: "Support",
  kind: "human",
  isActive: true,
  deletedAt: null,
  accessLevel: "manager",
  createdAt: "2026-07-30T12:00:00.000Z",
  updatedAt: "2026-07-30T12:00:00.000Z"
};
const disabledMailbox: Mailbox = {
  ...mailbox,
  id: "mailbox-disabled",
  address: "archive@example.com",
  isActive: false
};

describe("mail shell", () => {
  it("uses the full header width and keeps mail actions in a right-aligned group", () => {
    const html = renderToStaticMarkup(
      <TopBar
        activeFolder="inbox"
        draftCount={0}
        mailboxId="all"
        mailboxes={[]}
        search=""
        unread={unread}
        user={user}
        onCompose={() => undefined}
        onFolderChange={() => undefined}
        onMailboxChange={() => undefined}
        onSearchChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain("h-12 w-full");
    expect(html).toContain("relative min-w-0 max-w-xl flex-1");
    expect(html).toContain("Search HQBase");
    expect(html).not.toContain("Connect MCP");
    expect(html).toContain("Open navigation");
    expect(html.indexOf("Open navigation")).toBeLessThan(html.indexOf("Search HQBase"));
  });

  it("keeps unread totals out of the header mailbox label", () => {
    const html = renderToStaticMarkup(
      <TopBar
        activeFolder="inbox"
        draftCount={0}
        mailboxId={mailbox.id}
        mailboxes={[mailbox]}
        search=""
        unread={unread}
        user={user}
        onCompose={() => undefined}
        onFolderChange={() => undefined}
        onMailboxChange={() => undefined}
        onSearchChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain(">support@example.com<");
    expect(html).not.toContain("support@example.com (4)");
  });

  it("marks a selected disabled mailbox in the header filter", () => {
    const html = renderToStaticMarkup(
      <TopBar
        activeFolder="inbox"
        draftCount={0}
        mailboxId={disabledMailbox.id}
        mailboxes={[mailbox, disabledMailbox]}
        search=""
        unread={unread}
        user={user}
        onCompose={() => undefined}
        onFolderChange={() => undefined}
        onMailboxChange={() => undefined}
        onSearchChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain("archive@example.com");
    expect(html).toContain("Disabled");
    expect(html).toContain("text-muted-foreground");
  });

  it("exposes the desktop sidebar state from the sidebar header control", () => {
    const visibleHtml = renderToStaticMarkup(
      <Sidebar
        activeFolder="inbox"
        mailboxId="all"
        sidebarCollapsed={false}
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
        onToggleSidebar={() => undefined}
      />
    );
    const collapsedHtml = renderToStaticMarkup(
      <Sidebar
        activeFolder="inbox"
        mailboxId="all"
        sidebarCollapsed
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
        onToggleSidebar={() => undefined}
      />
    );

    expect(visibleHtml).toContain('aria-label="Hide sidebar"');
    expect(collapsedHtml).toContain('aria-label="Show sidebar"');
    expect(visibleHtml).toContain("justify-between");
    expect(visibleHtml).toContain("rounded-[24px] border border-divider");
    expect(visibleHtml).not.toContain("bg-black");
    expect(visibleHtml).not.toContain("rounded-r-[24px]");
    const topBarHtml = renderToStaticMarkup(
      <TopBar
        activeFolder="inbox"
        draftCount={0}
        mailboxId="all"
        mailboxes={[]}
        search=""
        unread={unread}
        user={user}
        onCompose={() => undefined}
        onFolderChange={() => undefined}
        onMailboxChange={() => undefined}
        onSearchChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );
    expect(topBarHtml).not.toContain('aria-label="Show sidebar"');
    expect(topBarHtml).not.toContain('aria-label="Hide sidebar"');
  });

  it("keeps sidebar navigation at its established desktop and drawer sizes", () => {
    const desktopHtml = renderToStaticMarkup(
      <Sidebar
        activeFolder="inbox"
        mailboxId="all"
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );
    const drawerHtml = renderToStaticMarkup(
      <Sidebar
        activeFolder="inbox"
        mailboxId="all"
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
        variant="drawer"
      />
    );

    expect(desktopHtml).toContain("h-10 min-h-10 justify-start");
    expect(desktopHtml).toContain("size-10 min-h-10 min-w-10");
    expect(drawerHtml).toContain("h-11 min-h-11 rounded-[16px]");
    expect(drawerHtml).toContain("size-10 min-h-10 min-w-10");
  });

  it("shows an accessible mail connection status beside the sidebar title", () => {
    const labels = {
      connecting: "Connecting to live updates",
      connected: "Live updates connected",
      fallback: "Using fallback sync while live updates reconnect",
      unavailable: "Cannot connect to HQBase"
    } as const;

    for (const [connectionStatus, label] of Object.entries(labels)) {
      const html = renderToStaticMarkup(
        <Sidebar
          activeFolder="inbox"
          connectionStatus={connectionStatus as keyof typeof labels}
          mailboxId="all"
          unread={unread}
          user={user}
          onFolderChange={() => undefined}
          onSignedOut={() => undefined}
        />
      );

      expect(html).toContain(`data-connection-status="${connectionStatus}"`);
      expect(html).toContain(`aria-label="${label}"`);
      expect(html.indexOf(">Mail</span>")).toBeLessThan(
        html.indexOf(`data-connection-status="${connectionStatus}"`)
      );
    }
  });

  it("renders the canonical logo instead of the HQ placeholder", () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeFolder="inbox"
        mailboxId="all"
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain('src="/logo.svg"');
    expect(html).toContain('href="/mail/inbox"');
    expect(html).toContain('href="/mail/catch-all"');
    expect(html).toContain('href="/settings/mailboxes"');
    expect(html).not.toContain("Connect MCP");
    expect(html).toContain("7 unread");
    expect(html).toContain("2 unread");
    expect(html).not.toContain(">HQ<");
  });

  it("makes Contacts a primary destination with its own navigation", () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeFolder="contacts"
        mailboxId="all"
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Contacts navigation"');
    expect(html).toContain('href="/contacts"');
    expect(html).toContain(">All contacts</span>");
    expect(html).toContain('aria-label="Contacts"');
    expect(html).toContain("hover:bg-selected");
  });

  it("uses the canonical logo on the signed-out surface", () => {
    const html = renderToStaticMarkup(<LoginPage onLogin={() => undefined} />);

    expect(html).toContain('src="/logo.svg"');
    expect(html).toContain(
      '<a class="underline-offset-4 transition-colors hover:text-foreground hover:underline" href="https://hqbase.io/" rel="noopener" target="_blank">Powered by HQBase</a>'
    );
    expect(html).not.toContain(">HQ</span>");
  });

  it("uses a labelled hamburger trigger instead of a mobile folder select", () => {
    const html = renderToStaticMarkup(
      <MobileNavigation
        activeFolder="catchall"
        draftCount={0}
        mailboxId="all"
        mailboxes={[]}
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onMailboxChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Open navigation"');
    expect(html).toContain('title="Open navigation"');
    expect(html).toContain("size-11");
    expect(html).toContain("lg:hidden");
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain("Catch-all");
  });

  it("gives the drawer a mailbox filter and mobile-sized destinations", () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeFolder="inbox"
        mailboxId="all"
        mailboxFilter={{
          mailboxes: [mailbox],
          value: "all",
          onChange: () => undefined
        }}
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
        variant="drawer"
      />
    );

    expect(html).toContain("flex h-full w-full");
    expect(html).toContain('aria-label="Mailbox filter"');
    expect(html).toContain('id="drawer-mailbox-filter"');
    expect(html).toContain("h-[42px] min-h-[42px]");
    expect(html).toContain('for="drawer-mailbox-filter">Mailbox</label>');
    expect(html.indexOf(">Mailbox</label>")).toBeLessThan(html.indexOf(">Inbox</span>"));
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("Connect MCP");
    expect(html).toContain('aria-label="Quick access"');
    expect(html).toContain('aria-label="Mail"');
    expect(html).toContain('aria-label="Contacts"');
    expect(html).toContain('aria-label="Agents"');
    expect(html).toContain('aria-label="Settings"');
    expect(html).not.toContain(">Contacts</span>");
    expect(html).not.toContain(">Settings</span>");
    expect(html).toContain("bg-black");
    expect(html).toContain("bg-transparent");
    expect(html).not.toContain("border-l border-divider");
    expect(html).toContain("w-full items-center");
    expect(html).not.toContain("rounded-[24px]");
    expect(html).not.toContain("rounded-r-[24px]");
  });

  it("groups Settings destinations by purpose", () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeFolder="settings"
        activeSettingsTab="preferences"
        canManage
        mailboxId="all"
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSettingsTabChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Settings navigation"');
    expect(html).toContain("Workspace");
    expect(html).toContain("Mail");
    expect(html).toContain("Personal");
    expect(html).toContain("System");
    expect(html).toContain("mt-auto");
    expect(html).toContain("Mailboxes");
    expect(html).toContain("People");
    expect(html).toContain("Preferences");
    expect(html).toContain('href="/settings/preferences"');
    expect(html).not.toContain("Debug");
    expect(html).not.toContain('href="/settings/agents"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("Your mail");
    expect(html.indexOf("Preferences")).toBeLessThan(html.indexOf("System"));
    expect(html.indexOf("System")).toBeLessThan(html.indexOf("Updates"));
  });

  it("hides workspace administration from people who cannot manage it", () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeFolder="settings"
        activeSettingsTab="preferences"
        mailboxId="all"
        unread={unread}
        user={{ ...user, role: "member" }}
        onFolderChange={() => undefined}
        onSettingsTabChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain("Mailboxes");
    expect(html).toContain("Labels");
    expect(html).toContain("Signatures");
    expect(html).toContain("Preferences");
    expect(html).not.toContain("Domains");
    expect(html).not.toContain("People");
    expect(html).not.toContain("System");
    expect(html).not.toContain("Updates");
  });

  it("shows one destination in the Agents navigation", () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeFolder="agents"
        canManage
        mailboxId="all"
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain('aria-label="Agents navigation"');
    expect(html).toContain('href="/agents"');
    expect(html).toContain("All connections");
    expect(html).not.toContain('href="/agents/mailboxes"');
  });

  it("scopes the Inbox count to the selected mailbox", () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeFolder="inbox"
        mailboxId="mailbox-1"
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain("4 unread");
    expect(html).not.toContain("7 unread");
    expect(html).toContain("2 unread");
  });

  it("shows Drafts with its private count only when drafts exist or the route is active", () => {
    const withoutDrafts = renderToStaticMarkup(
      <Sidebar
        activeFolder="inbox"
        mailboxId="all"
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );
    const withDrafts = renderToStaticMarkup(
      <Sidebar
        activeFolder="inbox"
        draftCount={3}
        mailboxId="all"
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );
    const activeEmptyDrafts = renderToStaticMarkup(
      <Sidebar
        activeFolder="drafts"
        draftCount={0}
        mailboxId="all"
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(withoutDrafts).not.toContain('href="/mail/drafts"');
    expect(withDrafts).toContain('href="/mail/drafts"');
    expect(withDrafts).toContain("3 drafts");
    expect(activeEmptyDrafts).toContain('href="/mail/drafts"');
    expect(activeEmptyDrafts).toContain('aria-current="page"');
  });

  it("lists private drafts as reopenable rows with filtering and attachment state", () => {
    const label = {
      color: "teal" as const,
      createdAt: "2026-07-29T13:00:00.000Z",
      id: "label-follow-up",
      name: "Follow up",
      updatedAt: "2026-07-29T13:00:00.000Z"
    };
    const html = renderToStaticMarkup(
      <DraftsPage
        drafts={[
          {
            id: "draft/one",
            mailboxId: "mailbox-1",
            replyToMessageId: null,
            forwardOfMessageId: null,
            from: "olivia@example.com",
            to: ["support@example.com"],
            cc: [],
            bcc: [],
            subject: "Quarterly follow-up",
            text: "Here is the requested summary.",
            html: "<p>Here is the requested summary.</p>",
            signature: { mode: "automatic", id: null, name: "", html: "", text: "" },
            version: 2,
            updatedAt: "2026-07-29T14:00:00.000Z",
            attachments: [
              {
                id: "attachment-1",
                filename: "summary.pdf",
                contentType: "application/pdf",
                sizeBytes: 100,
                inline: false
              },
              {
                id: "inline-1",
                filename: "logo.png",
                contentType: "image/png",
                sizeBytes: 8,
                inline: true
              }
            ],
            labels: [label]
          }
        ]}
        isLoading={false}
        labelIds={[label.id]}
        labels={[label]}
        mailboxId="all"
        search=""
        selectedId={null}
        onBack={() => undefined}
        onLabelChange={() => undefined}
        onSelect={() => undefined}
        onToggleLabel={() => undefined}
      />
    );

    expect(html).toContain("Drafts");
    expect(html).toContain("support@example.com");
    expect(html).toContain("Quarterly follow-up");
    expect(html).toContain("Here is the requested summary.");
    expect(html).toContain('href="/mail/drafts/draft%2Fone"');
    expect(html).toContain("1 attachment");
    expect(html).toContain("Filter by labels: Follow up");
    expect(html).toContain("Labels: Follow up");
    const draftScroll = html.match(/<div[^>]*data-draft-list-scroll=""[^>]*>/u)?.[0];
    expect(draftScroll).toContain("[scrollbar-gutter:stable]");
    expect(html).toContain('data-message-labels="compact"');
    expect(html).toContain('data-message-labels="desktop"');
    expect(html).not.toContain("2 attachments");
    expect(html).toContain("grid-cols-[2.5rem_minmax(0,1fr)_4rem]");
    expect(html).toContain("sm:grid-cols-[2rem_minmax(7rem,18%)_1rem_minmax(0,1fr)_1.75rem_4rem]");
    expect(html).toContain("sm:col-start-3 sm:row-start-1 sm:flex");
    expect(html).toContain("sm:col-start-4 sm:row-start-1 sm:h-8 sm:items-center");
    expect(html).toContain("sm:col-start-6 sm:row-start-1 sm:text-[12px]");
    expect(html).not.toContain("w-[5.75rem]");
    expect(html.match(/aria-label="1 attachment"/gu)).toHaveLength(2);
    expect(html.indexOf('aria-label="1 attachment"')).toBeLessThan(
      html.indexOf("Quarterly follow-up")
    );
  });

  it("combines the compact folder label and conversation count in one list header", () => {
    const html = renderToStaticMarkup(
      <InboxPage
        activeFolder="inbox"
        conversations={[]}
        defaultFromMailboxId={user.defaultFromMailboxId}
        hasMore={false}
        isLoadingMore={false}
        loadMoreError={null}
        mailboxes={[]}
        selectedId={null}
        onConversationAction={() => undefined}
        onLoadMore={() => undefined}
        onMessageRouteChange={() => undefined}
        onRefresh={() => undefined}
        onSelect={() => undefined}
        totalCount={0}
      />
    );

    expect(html).toContain(">Inbox</span>");
    expect(html).toContain("0 conversations");
    expect(html).not.toContain("Navigation");
  });

  it("defaults to the Mail actions MCP profile and exposes the server switcher", () => {
    const html = renderToStaticMarkup(
      <McpConnectionDetails
        fullEndpoint="https://mail.example.com/mcp/full"
        fullEndpointId="mcp-full-endpoint"
        readOnlyEndpoint="https://mail.example.com/mcp"
        readOnlyEndpointId="mcp-read-endpoint"
        user={user}
      />
    );

    expect(html).toContain("https://mail.example.com/mcp/full");
    expect(html).toContain("Read only");
    expect(html).toContain("Mail actions");
    expect(html.indexOf("Mail actions")).toBeLessThan(html.indexOf("Read only"));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-state="active"');
    expect(html).toContain('data-state="inactive"');
    expect(html).toContain("Copy Read, manage &amp; send endpoint");
    expect(html).not.toContain("Copy Read only endpoint");
    expect(html).toContain("OAuth 2.1");
    expect(html).toContain("registers dynamically with PKCE");
    expect(html).toContain("Connecting as");
    expect(html).toContain('data-icon="connection-identity"');
    expect(html).toContain("olivia@example.com");
    expect(html).toContain("current workspace role");
    expect(html).toContain("live mailbox grants");
    expect(html).not.toContain("Community");
    expect(html).not.toContain("Pro");
  });

  it("renders Compose as a non-modal responsive work surface", () => {
    const html = renderToStaticMarkup(
      <ComposeWindow open status="Draft saved" title="New message" onOpenChange={() => undefined}>
        <div>Draft fields</div>
      </ComposeWindow>
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="false"');
    expect(html).toContain("fixed inset-0");
    expect(html).toContain("lg:bottom-0");
    expect(html).toContain("lg:resize");
    expect(html).toContain('aria-label="Minimize compose"');
    expect(html).not.toContain('aria-label="Expand compose"');
    expect(html).toContain('aria-label="Close compose"');
    expect(html).toContain("Draft fields");
  });
});
