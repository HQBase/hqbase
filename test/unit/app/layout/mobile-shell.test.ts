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
const styles = readFileSync(new URL("../../../../app/styles.css", import.meta.url), "utf8");

describe("mobile application shell", () => {
  it("uses dynamic viewport and sidebar-colored safe areas", () => {
    expect(appShell).toContain("h-[100dvh]");
    expect(mobileNavigation).toContain("safe-area-inset-top");
    expect(mobileNavigation).toContain("safe-area-inset-bottom");
    expect(sidebar).toContain("safe-area-inset-top");
    expect(sidebar).toContain("safe-area-inset-bottom");
  });

  it("keeps editable field text large enough to avoid iOS focus zoom", () => {
    expect(styles).toContain("@media (max-width: 767px)");
    expect(styles).toContain('[contenteditable="true"][class]');
    expect(styles).toContain("font-size: 16px");
  });
});
