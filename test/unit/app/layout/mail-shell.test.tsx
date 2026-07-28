import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { ComposeWindow } from "@/features/compose/compose-window";
import { InboxPage } from "@/features/inbox/inbox-page";
import { McpConnectionDetails } from "@/features/mcp/connection-dialog";

const user = {
  id: "user-1",
  email: "olivia@example.com",
  name: "Olivia Berman",
  role: "owner" as const
};

describe("mail shell", () => {
  it("uses the full header width and keeps mail actions in a right-aligned group", () => {
    const html = renderToStaticMarkup(
      <TopBar
        activeFolder="inbox"
        mailboxId="all"
        mailboxes={[]}
        search=""
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
    expect(html).toContain("Connect MCP");
    expect(html).toContain("Open navigation");
    expect(html.indexOf("Open navigation")).toBeLessThan(html.indexOf("Search mail"));
    expect(html).not.toContain("Open profile menu");
    expect(html).not.toContain("OB");
  });

  it("renders the canonical logo instead of the HQ placeholder", () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeFolder="inbox"
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
      />
    );

    expect(html).toContain('src="/logo.svg"');
    expect(html).toContain('href="/inbox"');
    expect(html).toContain('href="/catch-all"');
    expect(html).toContain('href="/settings/mailboxes"');
    expect(html).toContain("Open profile menu");
    expect(html).toContain("OB");
    expect(html.indexOf("Settings")).toBeLessThan(html.indexOf("Open profile menu"));
    expect(html).not.toContain(">HQ<");
    expect(html).not.toContain(">Mail</div>");
  });

  it("uses a labelled hamburger trigger instead of a mobile folder select", () => {
    const html = renderToStaticMarkup(
      <MobileNavigation
        activeFolder="catchall"
        user={user}
        onFolderChange={() => undefined}
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

  it("gives drawer destinations mobile-sized targets and marks the active page", () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeFolder="inbox"
        drawerAction={<button type="button">Connect MCP</button>}
        user={user}
        onFolderChange={() => undefined}
        onSignedOut={() => undefined}
        variant="drawer"
      />
    );

    expect(html).toContain("flex h-full w-full");
    expect(html).toContain("h-11 text-sm");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Connect MCP");
    expect(html.indexOf("Settings")).toBeLessThan(html.indexOf("Open profile menu"));
  });

  it("combines the compact folder label and message count in one list header", () => {
    const html = renderToStaticMarkup(
      <InboxPage
        activeFolder="inbox"
        mailboxes={[]}
        messages={[]}
        selectedId={null}
        onMessageRouteChange={() => undefined}
        onRefresh={() => undefined}
        onSelect={() => undefined}
      />
    );

    expect(html).toContain('<span class="md:hidden">Inbox</span>');
    expect(html).toContain('<span class="hidden md:inline">Messages</span>');
    expect(html).not.toContain("Navigation");
  });

  it("explains the existing MCP endpoint and inherited user permissions", () => {
    const html = renderToStaticMarkup(
      <McpConnectionDetails
        endpoint="https://mail.example.com/mcp"
        endpointId="mcp-endpoint"
        user={user}
      />
    );

    expect(html).toContain("https://mail.example.com/mcp");
    expect(html).toContain("remote Streamable HTTP MCP");
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
