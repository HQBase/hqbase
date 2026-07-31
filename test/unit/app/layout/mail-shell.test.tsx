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
import { mailboxUnreadLabel } from "@/features/notifications/unread";

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
  addresses: [],
  displayName: "Support",
  isActive: true,
  accessLevel: "manager",
  createdAt: "2026-07-30T12:00:00.000Z",
  updatedAt: "2026-07-30T12:00:00.000Z"
};

describe("mail shell", () => {
  it("uses the full header width and keeps primary mail actions in a right-aligned group", () => {
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

    expect(html).toContain("h-14 w-full");
    expect(html).toContain("relative min-w-0 max-w-xl flex-1");
    expect(html).toContain("ml-auto flex shrink-0 items-center gap-2");
    expect(html).toContain("Search mail");
    expect(html).toContain("Compose");
    expect(html).toContain('aria-label="New email"');
    expect(html).not.toContain("Connect MCP");
    expect(html).toContain("Open navigation");
    expect(html.indexOf("Open navigation")).toBeLessThan(html.indexOf("Search mail"));
    expect(html).not.toContain("Open profile menu");
    expect(html).not.toContain("OB");
  });

  it("exposes the desktop sidebar state from the leading header control", () => {
    const visibleHtml = renderToStaticMarkup(
      <TopBar
        activeFolder="inbox"
        draftCount={0}
        mailboxId="all"
        mailboxes={[]}
        search=""
        sidebarCollapsed={false}
        unread={unread}
        user={user}
        onCompose={() => undefined}
        onFolderChange={() => undefined}
        onMailboxChange={() => undefined}
        onSearchChange={() => undefined}
        onSignedOut={() => undefined}
        onToggleSidebar={() => undefined}
      />
    );
    const collapsedHtml = renderToStaticMarkup(
      <TopBar
        activeFolder="inbox"
        draftCount={0}
        mailboxId="all"
        mailboxes={[]}
        search=""
        sidebarCollapsed
        unread={unread}
        user={user}
        onCompose={() => undefined}
        onFolderChange={() => undefined}
        onMailboxChange={() => undefined}
        onSearchChange={() => undefined}
        onSignedOut={() => undefined}
        onToggleSidebar={() => undefined}
      />
    );

    expect(visibleHtml).toContain('aria-label="Hide sidebar"');
    expect(collapsedHtml).toContain('aria-label="Show sidebar"');
  });

  it("renders the canonical logo instead of the HQ placeholder", () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeFolder="inbox"
        mailboxId="all"
        unread={unread}
        user={user}
        utilityAction={<button type="button">Connect MCP</button>}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain('src="/logo.svg"');
    expect(html).toContain('href="/inbox"');
    expect(html).toContain('href="/catch-all"');
    expect(html).toContain('href="/settings/mailboxes"');
    expect(html).toContain("7 unread");
    expect(html).toContain("2 unread");
    expect(html).toContain("Open profile menu");
    expect(html).toContain("OB");
    expect(html.indexOf("Connect MCP")).toBeLessThan(html.indexOf("Settings"));
    expect(html.indexOf("Settings")).toBeLessThan(html.indexOf("Open profile menu"));
    expect(html).toContain("Dark mode");
    expect(html).toContain('aria-label="Switch to light mode"');
    expect(html.indexOf("Settings")).toBeLessThan(html.indexOf("Dark mode"));
    expect(html.indexOf("Dark mode")).toBeLessThan(html.indexOf("Open profile menu"));
    expect(html.match(/border-t pt-2/g)).toHaveLength(2);
    expect(html).toContain('stroke-width="1.5"');
    expect(html).not.toContain(">HQ<");
    expect(html).not.toContain(">Mail</div>");
  });

  it("uses the canonical logo on the signed-out surface", () => {
    const html = renderToStaticMarkup(<LoginPage onLogin={() => undefined} />);

    expect(html).toContain('src="/logo.svg"');
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
    expect(html).toContain("md:hidden");
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
        utilityAction={<button type="button">Connect MCP</button>}
        unread={unread}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
        variant="drawer"
      />
    );

    expect(html).toContain("flex h-full w-full");
    expect(html).toContain("h-11 text-sm");
    expect(html).toContain('aria-label="Mailbox filter"');
    expect(html).toContain('id="drawer-mailbox-filter"');
    expect(html).toContain('for="drawer-mailbox-filter">Mailbox</label>');
    expect(html.indexOf(">Mailbox</label>")).toBeLessThan(html.indexOf(">Inbox</span>"));
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Connect MCP");
    expect(html.indexOf("Connect MCP")).toBeLessThan(html.indexOf("Settings"));
    expect(html.indexOf("Settings")).toBeLessThan(html.indexOf("Open profile menu"));
    expect(html.match(/border-t pt-2/g)).toHaveLength(2);
  });

  it("shows per-mailbox unread labels and scopes the Inbox count to the selection", () => {
    expect(mailboxUnreadLabel("All mailboxes", "all", unread)).toBe("All mailboxes (7)");
    expect(mailboxUnreadLabel("support@example.com", "mailbox-1", unread)).toBe(
      "support@example.com (4)"
    );
    expect(mailboxUnreadLabel("empty@example.com", "mailbox-empty", unread)).toBe(
      "empty@example.com (0)"
    );

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

    expect(withoutDrafts).not.toContain('href="/drafts"');
    expect(withDrafts).toContain('href="/drafts"');
    expect(withDrafts).toContain("3 drafts");
    expect(activeEmptyDrafts).toContain('href="/drafts"');
    expect(activeEmptyDrafts).toContain('aria-current="page"');
  });

  it("lists private drafts as reopenable rows with filtering and attachment state", () => {
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
            version: 2,
            updatedAt: "2026-07-29T14:00:00.000Z",
            attachments: [
              {
                id: "attachment-1",
                filename: "summary.pdf",
                contentType: "application/pdf",
                sizeBytes: 100
              }
            ]
          }
        ]}
        isLoading={false}
        mailboxId="all"
        search=""
        selectedId={null}
        onBack={() => undefined}
        onSelect={() => undefined}
      />
    );

    expect(html).toContain("Drafts");
    expect(html).toContain("support@example.com");
    expect(html).toContain("Quarterly follow-up");
    expect(html).toContain("Here is the requested summary.");
    expect(html).toContain('href="/drafts/draft%2Fone"');
    expect(html).toContain("1 attachment");
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

    expect(html).toContain('<span class="md:hidden">Inbox</span>');
    expect(html).toContain('<span class="hidden md:inline">Conversations</span>');
    expect(html).not.toContain("Navigation");
  });

  it("defaults to the read-only MCP profile and exposes the server switcher", () => {
    const html = renderToStaticMarkup(
      <McpConnectionDetails
        fullEndpoint="https://mail.example.com/mcp/full"
        fullEndpointId="mcp-full-endpoint"
        readOnlyEndpoint="https://mail.example.com/mcp"
        readOnlyEndpointId="mcp-read-endpoint"
        user={user}
      />
    );

    expect(html).toContain("https://mail.example.com/mcp");
    expect(html).not.toContain("https://mail.example.com/mcp/full");
    expect(html).toContain("Read only");
    expect(html).toContain("Mail actions");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-state="active"');
    expect(html).toContain('data-state="inactive"');
    expect(html).toContain("Copy Read only endpoint");
    expect(html).toContain("OAuth 2.1");
    expect(html).toContain("registers dynamically with PKCE");
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
    expect(html).toContain("md:bottom-0");
    expect(html).toContain('aria-label="Minimize compose"');
    expect(html).toContain('aria-label="Expand compose"');
    expect(html).toContain('aria-label="Close compose"');
    expect(html).toContain("Draft fields");
  });
});
