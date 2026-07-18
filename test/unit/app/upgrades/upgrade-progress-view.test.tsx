import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  UpgradeAuthorizeView,
  UpgradeProgressView
} from "@/features/upgrades/upgrade-progress-view";

describe("upgrade progress UI", () => {
  it("uses the shared onboarding shell before Cloudflare authorization", () => {
    const html = renderToStaticMarkup(
      <UpgradeAuthorizeView busy={false} error={null} onAuthorize={() => undefined} />
    );

    expect(html).toContain("Upgrade this workspace to Pro");
    expect(html).toContain('aria-label="Upgrade progress"');
    expect(html).toContain("Authorize Cloudflare and upgrade");
    expect(html).toContain("Community installation found");
    expect(html).not.toContain('class="product-header"');
  });

  it("keeps an authentication failure inside the resumable checkpoint", () => {
    const html = renderToStaticMarkup(
      <UpgradeProgressView
        active="migration_complete"
        busy={false}
        error="Sign in is required."
        needsSignIn
        status={{
          completedAt: null,
          errorCode: "OWNER_SESSION_REQUIRED",
          id: "upgrade-test",
          recoveryAction: null,
          state: "migration_started",
          updatedAt: "2026-07-17T00:00:00.000Z"
        }}
        onAuthorize={() => undefined}
        onRetry={() => undefined}
        onSignIn={() => undefined}
      />
    );

    expect(html).toContain("Database migrated");
    expect(html).toContain("Needs attention");
    expect(html).toContain("Sign in again");
    expect(html).not.toContain("Return to Settings and start the upgrade again");
  });
});
