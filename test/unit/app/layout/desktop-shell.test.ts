import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShell = readFileSync(
  new URL("../../../../app/components/layout/app-shell.tsx", import.meta.url),
  "utf8"
);
const workspacePages = readFileSync(
  new URL("../../../../app/workspace-pages.tsx", import.meta.url),
  "utf8"
);
const desktopLayout = readFileSync(
  new URL("../../../../app/components/layout/desktop-layout.ts", import.meta.url),
  "utf8"
);
const inboxPage = readFileSync(
  new URL("../../../../app/features/inbox/inbox-page.tsx", import.meta.url),
  "utf8"
);
const draftComposeDialog = readFileSync(
  new URL("../../../../app/features/drafts/draft-compose-dialog.tsx", import.meta.url),
  "utf8"
);
const threadComposeSurface = readFileSync(
  new URL("../../../../app/features/compose/thread-compose-surface.tsx", import.meta.url),
  "utf8"
);
const styles = readFileSync(new URL("../../../../app/styles.css", import.meta.url), "utf8");

describe("desktop application shell", () => {
  it("uses a persisted collapsible sidebar with an accessible toggle", () => {
    expect(appShell).toContain("sidebarCollapsedStorageKey");
    expect(appShell).toContain("sidebarCollapsed");
    expect(appShell).not.toContain("ResizablePanelGroup");
    expect(appShell).not.toContain('aria-label="Resize sidebar"');
    const sidebar = readFileSync(
      new URL("../../../../app/components/layout/sidebar.tsx", import.meta.url),
      "utf8"
    );
    expect(sidebar).toContain("Show sidebar");
    expect(sidebar).toContain("Hide sidebar");
    expect(sidebar).toContain("sidebarCollapsed");
  });

  it("opens a conversation in the full mail content area", () => {
    expect(appShell.match(/<ShellContent/gu)).toHaveLength(1);
    expect(appShell).toContain("desktop-sidebar");
    expect(appShell).toContain("desktop-content");
    expect(inboxPage).toContain("if (selectedId)");
    expect(inboxPage).toContain("showBack");
    expect(inboxPage).not.toContain("hqbase-conversation-workspace");
    expect(inboxPage).not.toContain("ResizablePanelGroup");
  });

  it("switches to the compact shell below 1024 pixels without a blocking guard", () => {
    expect(desktopLayout).not.toContain("desktopMinimumWidth");
    expect(desktopLayout).not.toContain("desktopMinimumHeight");
    expect(appShell).not.toContain("useDesktopShell");
    expect(appShell.match(/<ShellContent/gu)).toHaveLength(1);
    expect(appShell).toContain('"hidden w-[20rem] shrink-0 lg:block"');
    expect(appShell).not.toContain("Make the HQBase window a little larger");
    expect(styles).not.toContain("desktop-window-guard");
  });

  it("keeps inline Reply and Forward at the registered conversation target", () => {
    expect(threadComposeSurface).toContain("createPortal(desktop, inlineTarget)");
    expect(threadComposeSurface).toContain('aria-label="Detach composer"');
  });

  it("reopens Reply and Forward drafts with their conversation", () => {
    expect(workspacePages).toContain("selectedDraftHasContext");
    expect(draftComposeDialog).toContain("getMessageThread(contextMessageId)");
    expect(draftComposeDialog).toContain("openDraft({");
    expect(draftComposeDialog).toContain("ComposerInlineTarget sessionId={sessionId}");
    expect(draftComposeDialog).toContain("draftId: draft.id");
  });
});
