import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShell = readFileSync(
  new URL("../../../../app/components/layout/app-shell.tsx", import.meta.url),
  "utf8"
);
const mobileNavigation = readFileSync(
  new URL("../../../../app/components/layout/mobile-navigation.tsx", import.meta.url),
  "utf8"
);
const settingsPage = readFileSync(
  new URL("../../../../app/features/settings/settings-page.tsx", import.meta.url),
  "utf8"
);
const contactsPage = readFileSync(
  new URL("../../../../app/features/contacts/contacts-page.tsx", import.meta.url),
  "utf8"
);
const contactViews = readFileSync(
  new URL("../../../../app/features/contacts/contact-views.tsx", import.meta.url),
  "utf8"
);
const topBar = readFileSync(
  new URL("../../../../app/components/layout/top-bar.tsx", import.meta.url),
  "utf8"
);
const pullToRefresh = readFileSync(
  new URL("../../../../app/components/ui/pull-to-refresh.tsx", import.meta.url),
  "utf8"
);
const sidebar = readFileSync(
  new URL("../../../../app/components/layout/sidebar.tsx", import.meta.url),
  "utf8"
);
const sheet = readFileSync(
  new URL("../../../../app/components/ui/sheet.tsx", import.meta.url),
  "utf8"
);
const composeWindow = readFileSync(
  new URL("../../../../app/features/compose/compose-window.tsx", import.meta.url),
  "utf8"
);
const composeForm = readFileSync(
  new URL("../../../../app/features/compose/compose-form.tsx", import.meta.url),
  "utf8"
);
const agentConnectionDetails = readFileSync(
  new URL("../../../../app/features/agents/connection-dialog.tsx", import.meta.url),
  "utf8"
);
const mcpConnectionDetails = readFileSync(
  new URL("../../../../app/features/mcp/connection-dialog.tsx", import.meta.url),
  "utf8"
);
const connectedAppsPage = readFileSync(
  new URL("../../../../app/features/connected-apps/connected-apps-page.tsx", import.meta.url),
  "utf8"
);
const agentsPage = readFileSync(
  new URL("../../../../app/features/agents/agents-page.tsx", import.meta.url),
  "utf8"
);
const threadComposeSurface = readFileSync(
  new URL("../../../../app/features/compose/thread-compose-surface.tsx", import.meta.url),
  "utf8"
);
const styles = readFileSync(new URL("../../../../app/styles.css", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../../../../index.html", import.meta.url), "utf8");

describe("mobile application shell", () => {
  it("uses dynamic viewport and sidebar-colored safe areas", () => {
    expect(appShell).toContain("h-[100dvh]");
    expect(appShell).toContain("pt-[env(safe-area-inset-top)]");
    expect(mobileNavigation).toContain("safe-area-inset-top");
    expect(mobileNavigation).toContain("safe-area-inset-bottom");
    expect(sidebar).toContain("safe-area-inset-top");
    expect(sidebar).toContain("safe-area-inset-bottom");
  });

  it("keeps compact right sheets and composer controls clear of device safe areas", () => {
    expect(sheet).toContain("max-md:pt-[max(1.25rem,env(safe-area-inset-top))]");
    expect(sheet).toContain("max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))]");
    expect(sheet).toContain("max-md:top-[max(0.75rem,env(safe-area-inset-top))]");
    expect(composeWindow).toContain("pt-[env(safe-area-inset-top)]");
    expect(threadComposeSurface).toContain("pt-[env(safe-area-inset-top)]");
    expect(composeForm).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
  });

  it("keeps delegated connections separate from machine identities", () => {
    expect(agentConnectionDetails).toContain('label="or"');
    expect(agentConnectionDetails).toContain('title="Skill + API"');
    expect(agentConnectionDetails).not.toContain('aria-label="Connection method"');
    expect(mcpConnectionDetails).toContain("text-base sm:text-xs");
    expect(mcpConnectionDetails).toContain('value="read-only"');
    expect(mcpConnectionDetails).toContain('value="mail-actions"');
    expect(connectedAppsPage).toContain("/mcp/full");
    expect(connectedAppsPage).toContain("/skills/hqbase-mail/SKILL.md");
    expect(connectedAppsPage).toContain("Your connections");
    expect(agentsPage).toContain('profile="mailbox"');
    expect(agentsPage).toContain('profile="provisioner"');
  });

  it("removes agent connections from Settings", () => {
    expect(settingsPage).not.toContain("McpSettings");
    expect(settingsPage).not.toContain("AgentSettings");
    expect(appShell).toContain("activeAgentTab");
    expect(mobileNavigation).toContain("onAgentTabChange");
  });

  it("uses a compact desktop mailbox dropdown with agent mailboxes last", () => {
    expect(topBar).toContain("DropdownMenuTrigger");
    expect(topBar).toContain('side="bottom"');
    expect(topBar).not.toContain("SelectTrigger");
    expect(topBar).not.toContain("mailboxUnreadLabel");
    expect(topBar).toContain('className="hidden h-8 min-h-0');
    expect(topBar).toContain('mailbox.kind === "human"');
    expect(topBar).toContain('mailbox.kind === "agent"');
    expect(topBar.indexOf("humanMailboxes.map")).toBeLessThan(topBar.indexOf("Agent mailboxes"));
    expect(topBar.indexOf("Agent mailboxes")).toBeLessThan(topBar.indexOf("agentMailboxes.map"));
    expect(topBar).toContain("PiRobot");
    expect(topBar).toContain('className="py-1 text-xs"');
  });

  it("keeps editable field text large enough to avoid iOS focus zoom", () => {
    expect(styles).toContain("@media (max-width: 767px)");
    expect(styles).toContain('[contenteditable="true"][class]');
    expect(styles).toContain("font-size: 16px");
  });

  it("keeps persistent mail chrome fixed and ignores pans that begin in the header", () => {
    expect(appShell).not.toContain("immersiveOnCompact");
    expect(appShell).toContain("touch-manipulation");
    expect(appShell).toContain('dataset.hqbaseShell = "fixed"');
    expect(appShell).toContain("h-[env(safe-area-inset-top)] touch-none");
    expect(topBar).toContain("shrink-0 touch-none");
    expect(styles).toContain("overscroll-behavior: none");
    expect(styles).toContain('html[data-hqbase-shell="fixed"] #root');
    expect(styles).toContain("overflow: hidden");
  });

  it("uses the inbox content width for Contacts, Agents, and Settings", () => {
    expect(settingsPage).toContain("max-w-[960px]");
    expect(settingsPage).not.toContain("max-w-6xl");
    expect(contactsPage).toContain("max-w-[960px]");
    expect(contactsPage).not.toContain("max-w-[1200px]");
    expect(agentsPage).toContain("max-w-[960px]");
    expect(contactViews).toContain("max-w-[960px]");
    expect(contactViews).not.toContain("max-w-3xl");
  });

  it("refreshes inside mail scroll surfaces without disabling deliberate pinch zoom", () => {
    expect(pullToRefresh).toContain(
      'addEventListener("touchmove", handleTouchMove, { passive: false })'
    );
    expect(pullToRefresh).toContain("event.preventDefault()");
    expect(pullToRefresh).toContain("overscroll-contain");
    expect(pullToRefresh).toContain("Release to refresh");
    expect(pullToRefresh).toContain('playNotificationSound("refresh-pull")');
    expect(pullToRefresh).toContain('playNotificationSound("refresh-complete")');
    expect(pullToRefresh).toContain("completionResetDelay = 2000");
    expect(indexHtml).not.toContain("user-scalable=no");
    expect(indexHtml).not.toContain("maximum-scale=1");
  });

  it("uses the compact top safe-area strip to scroll the active mail surface to the top", () => {
    expect(appShell).toContain('aria-label="Scroll current view to top"');
    expect(appShell).toContain("onClick={scrollActiveMobileMailSurfaceToTop}");
    expect(pullToRefresh).toContain('data-pull-to-refresh-scroll=""');
  });

  it("offers a subtle floating scroll-to-top fallback", () => {
    expect(pullToRefresh).toContain("scrollToTopThreshold = 320");
    expect(pullToRefresh).toContain('aria-label="Scroll to top"');
    expect(pullToRefresh).toContain("safe-area-inset-bottom");
    expect(pullToRefresh).toContain("rounded-full");
    expect(pullToRefresh).toContain("hidden");
  });
});
