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
const threadComposeSurface = readFileSync(
  new URL("../../../../app/features/compose/thread-compose-surface.tsx", import.meta.url),
  "utf8"
);
const styles = readFileSync(new URL("../../../../app/styles.css", import.meta.url), "utf8");

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

  it("keeps editable field text large enough to avoid iOS focus zoom", () => {
    expect(styles).toContain("@media (max-width: 767px)");
    expect(styles).toContain('[contenteditable="true"][class]');
    expect(styles).toContain("font-size: 16px");
  });
});
