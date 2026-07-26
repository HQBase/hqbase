import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UpdateStatus } from "@/features/updates/types";
import { UpdateSettings } from "@/features/updates/update-settings";

const availableStatus: UpdateStatus = {
  product: "hqbase",
  installedVersion: "0.1.2",
  installedSchemaVersion: 2,
  channel: "stable",
  checkedAt: "2026-07-13T12:00:00.000Z",
  available: true,
  compatible: true,
  release: {
    version: "0.2.0",
    schemaVersion: 10,
    publishedAt: "2026-07-13T12:00:00.000Z",
    notesUrl: "https://example.com/releases/0.2.0"
  }
};

describe("update settings", () => {
  it("does not present an unknown update state as success", () => {
    const html = renderToStaticMarkup(<UpdateSettings initialStatus={null} />);
    expect(html).toContain("Not checked");
    expect(html).not.toContain("Up to date");
    expect(html).toContain("Unknown");
    expect(html).toContain("Check updates");
  });

  it("opens authorization from the update action without a credential field", () => {
    const html = renderToStaticMarkup(<UpdateSettings initialStatus={availableStatus} />);
    expect(html).toContain("Install update");
    expect(html).not.toContain('href="/api/updates/cloudflare/oauth/start"');
    expect(html).not.toContain("Authorize Cloudflare and update");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("API token");
    expect(html).toContain("Current");
    expect(html).toContain("0.1.2");
    expect(html).toContain("Available");
    expect(html).toContain("0.2.0");
    expect(html).not.toContain("HQBase 0.2.0");
    expect(html).not.toContain("Read release notes");
    expect(html).not.toContain("Schema 10");
  });

  it("makes incompatible releases explicit and disables the action", () => {
    const html = renderToStaticMarkup(
      <UpdateSettings initialStatus={{ ...availableStatus, compatible: false }} />
    );
    expect(html).toContain("Direct update unavailable");
    expect(html).toContain("cannot update directly");
    expect(html).toContain('disabled=""');
  });
});
