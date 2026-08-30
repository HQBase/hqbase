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
const dialog = readFileSync(
  new URL("../../../../app/components/ui/dialog.tsx", import.meta.url),
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
const connectionsTable = readFileSync(
  new URL("../../../../app/features/agents/connections-table.tsx", import.meta.url),
  "utf8"
);
const agentsPage = readFileSync(
  new URL("../../../../app/features/agents/agents-page.tsx", import.meta.url),
  "utf8"
);
const addConnectionDialog = readFileSync(
  new URL("../../../../app/features/agents/add-connection-dialog.tsx", import.meta.url),
  "utf8"
);
const threadComposeSurface = readFileSync(
  new URL("../../../../app/features/compose/thread-compose-surface.tsx", import.meta.url),
  "utf8"
);
const styles = readFileSync(new URL("../../../../app/styles.css", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../../../../index.html", import.meta.url), "utf8");
const theme = readFileSync(
  new URL("../../../../app/features/theme/theme.ts", import.meta.url),
  "utf8"
);

describe("mobile application shell", () => {
  it("uses dynamic viewport and app-canvas-colored safe areas", () => {
    expect(appShell).toContain("h-[100dvh]");
    expect(appShell).toContain("pt-[env(safe-area-inset-top)]");
    expect(mobileNavigation).toContain("safe-area-inset-top");
    expect(mobileNavigation).toContain("safe-area-inset-bottom");
    expect(mobileNavigation).toContain("before:bg-background");
    expect(mobileNavigation).toContain("after:bg-background");
    expect(mobileNavigation).not.toContain("!bg-transparent");
    expect(mobileNavigation).not.toContain("data-[state=closed]:!animate-none");
    expect(mobileNavigation).not.toContain("data-[state=open]:!animate-none");
    expect(mobileNavigation).not.toContain("clip-path");
    expect(sidebar).toContain("safe-area-inset-top");
    expect(sidebar).toContain("safe-area-inset-bottom");
    expect(styles).toContain("background-color: hsl(var(--surface-list))");
    expect(indexHtml).toContain('<meta name="theme-color" content="#0f0f10" />');
    expect(theme).toContain('dark: "#0f0f10"');
    expect(theme).toContain('light: "#fafafa"');
  });

  it("keeps compact right sheets and composer controls clear of device safe areas", () => {
    expect(sheet).toContain("max-md:pt-[max(1.25rem,env(safe-area-inset-top))]");
    expect(sheet).toContain("max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))]");
    expect(sheet).toContain("max-md:top-[max(0.75rem,env(safe-area-inset-top))]");
    expect(composeWindow).toContain("pt-[env(safe-area-inset-top)]");
    expect(threadComposeSurface).toContain("pt-[env(safe-area-inset-top)]");
    expect(composeForm).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
  });

  it("keeps compact dialogs and their close controls below device cutouts", () => {
    expect(dialog).toContain('data-slot="dialog-content"');
    expect(dialog).toContain("max-md:size-10");
    expect(styles).toContain(
      "--dialog-safe-top: max(1rem, calc(env(safe-area-inset-top) + 0.75rem))"
    );
    expect(styles).toContain("top: var(--dialog-safe-top)");
    expect(styles).toContain(
      "max-height: calc(100dvh - var(--dialog-safe-top) - var(--dialog-safe-bottom))"
    );
    expect(styles).toContain("transform: translateX(-50%)");
  });

  it("uses the theme rail surface in the compact navigation drawer", () => {
    expect(sidebar).toContain('? "bg-rail px-1');
    expect(sidebar).not.toContain("bg-black");
  });

  it("uses one responsive Agents list with contextual setup", () => {
    expect(agentConnectionDetails).toContain("export function AgentSkillDetails");
    expect(agentConnectionDetails).not.toContain('aria-label="Connection method"');
    expect(mcpConnectionDetails).toContain("text-base max-sm:h-[38px] sm:text-xs");
    expect(mcpConnectionDetails).toContain('size="sm"');
    expect(mcpConnectionDetails).toContain('value="read-only"');
    expect(mcpConnectionDetails).toContain('value="mail-actions"');
    expect(agentsPage).toContain("All connections");
    expect(agentsPage).toContain("Add connection");
    expect(addConnectionDialog).toContain("Use the Mail API skill instead");
    expect(addConnectionDialog).toContain('onSelect("mailbox")');
    expect(addConnectionDialog).toContain('onSelect("provisioner")');
    expect(addConnectionDialog).toContain("items-center gap-3");
    expect(addConnectionDialog).toContain("[&_svg]:size-5");
    expect(addConnectionDialog).not.toContain("rounded-md border bg-muted/30");
    expect(connectionsTable).toContain('className="block sm:table"');
    expect(connectionsTable).toContain("Setup instructions");
    expect(connectionsTable).toContain('status="Authorized"');
    expect(connectionsTable).toContain('agent.isActive ? "Enabled" : "Disabled"');
  });

  it("removes agent connections from Settings", () => {
    expect(settingsPage).not.toContain("McpSettings");
    expect(settingsPage).not.toContain("AgentSettings");
    expect(appShell).not.toContain("activeAgentTab");
    expect(mobileNavigation).not.toContain("onAgentTabChange");
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

  it("uses quiet focus treatments and compact trackless scrollbars", () => {
    expect(styles).toContain('input:not([type="checkbox"]):not([type="radio"])');
    expect(styles).toContain("--focus-border: 0 0% 48%");
    expect(styles).toContain("--focus-border: 0 0% 38%");
    expect(styles).toContain("border-color: hsl(var(--focus-border)) !important");
    expect(styles).toContain("--tw-ring-shadow: 0 0 #0000 !important");
    expect(styles).toContain("box-shadow: none !important");
    expect(styles).toContain('[data-slot="dropdown-select"]:focus-visible');
    expect(styles).toContain('[contenteditable="true"][data-compose-autofocus]');
    expect(styles).toContain("*::-webkit-scrollbar");
    expect(styles).toContain("width: 6px");
    expect(styles).toContain("scrollbar-width: thin");
    expect(styles).toContain("*::-webkit-scrollbar-track");
    expect(styles).toContain("background: transparent");
    expect(styles).toContain("border-radius: 999px");
    expect(styles).toContain("*::-webkit-scrollbar-thumb:hover");
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
