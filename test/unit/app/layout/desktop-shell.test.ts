import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShell = readFileSync(
  new URL("../../../../app/components/layout/app-shell.tsx", import.meta.url),
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
const topBar = readFileSync(
  new URL("../../../../app/components/layout/top-bar.tsx", import.meta.url),
  "utf8"
);
const resizable = readFileSync(
  new URL("../../../../app/components/ui/resizable.tsx", import.meta.url),
  "utf8"
);
const styles = readFileSync(new URL("../../../../app/styles.css", import.meta.url), "utf8");

describe("desktop application shell", () => {
  it("uses a persisted collapsible sidebar with an accessible resize divider", () => {
    expect(appShell).toContain("usePanelRef");
    expect(appShell).toContain('aria-label="Resize sidebar"');
    expect(appShell).toContain("sidebarCollapsedStorageKey");
    expect(appShell).toContain("sidebarWidthStorageKey");
    expect(topBar).toContain("Show sidebar");
    expect(topBar).toContain("Hide sidebar");
  });

  it("keeps the conversation list and reader keyboard-resizable within bounded widths", () => {
    expect(inboxPage).toContain('aria-label="Resize conversation list"');
    expect(inboxPage).toContain("minimumConversationListWidth");
    expect(inboxPage).toContain("maximumConversationListWidth");
    expect(inboxPage).toContain("minimumConversationReaderWidth");
    expect(inboxPage).toContain("conversationListWidthStorageKey");
    expect(resizable).toContain("ResizablePrimitive.Separator");
  });

  it("shows a soft minimum-size guard instead of switching a fine-pointer window to mobile", () => {
    expect(desktopLayout).toContain("desktopMinimumWidth = 1024");
    expect(desktopLayout).toContain("desktopMinimumHeight = 600");
    expect(appShell).toContain("Make the HQBase window a little larger");
    expect(styles).toContain("(hover: hover) and (pointer: fine) and (max-width: 1023px)");
    expect(styles).toContain("(hover: hover) and (pointer: fine) and (max-height: 599px)");
  });
});
