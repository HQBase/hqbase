import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildDebugReport, DebugSettings } from "@/features/settings/debug-settings";
import type { SetupStatus } from "@/features/setup/types";

const setup: SetupStatus = {
  isComplete: true,
  primaryDomain: "example.com",
  portalHostname: "mail.example.com",
  domains: [{ id: "domain-1", name: "example.com", isEnabled: true }],
  userCount: 3,
  mailboxCount: 4,
  checklistAcknowledged: true
};

describe("debug settings", () => {
  it("reports only workspace deployment state", () => {
    const report = buildDebugReport(setup);

    expect(report).toContain("# workspace");
    expect(report).toContain('product = "hqbase"');
    expect(report).toContain('primary_domain = "example.com"');
    expect(report).toContain("users = 3");
    expect(report).not.toContain("service_hostname");
    expect(report).not.toContain("entitlement");
    expect(report).not.toContain("upgrade");
  });

  it("renders a read-only report without credentials or paid state", () => {
    const html = renderToStaticMarkup(<DebugSettings setup={setup} />);

    expect(html).toContain('aria-label="HQBase debug report"');
    expect(html).toContain("readOnly");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("license");
  });
});
