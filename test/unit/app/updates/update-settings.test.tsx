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
    const html = renderSettings(null);
    expect(html).toContain("Not checked");
    expect(html).not.toContain("Up to date");
    expect(html).toContain("Unknown");
    expect(html).toContain("Check updates");
  });

  it("opens authorization from the update action without a credential field", () => {
    const html = renderSettings(availableStatus);
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
    const html = renderSettings({ ...availableStatus, compatible: false });
    expect(html).toContain("Direct update unavailable");
    expect(html).toContain("cannot update directly");
    expect(html).toContain('disabled=""');
  });

  it("shows the accepted build without offering to start it again", () => {
    const html = renderToStaticMarkup(
      <UpdateSettings
        initialStatus={availableStatus}
        progress={{ buildId: "build-123", startedAt: Date.now() }}
        onStatusChange={() => undefined}
        onUpdateStarted={() => undefined}
      />
    );
    expect(html).toContain("Update in progress");
    expect(html).toContain("animate-spin");
    expect(html).toContain("HQBase 0.2.0 is being deployed");
    expect(html).toContain("build-123");
    expect(html).not.toContain("Install update");
  });
});

function renderSettings(status: UpdateStatus | null): string {
  return renderToStaticMarkup(
    <UpdateSettings
      initialStatus={status}
      progress={null}
      onStatusChange={() => undefined}
      onUpdateStarted={() => undefined}
    />
  );
}
