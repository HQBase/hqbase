import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UpdateStatus } from "@/features/updates/types";
import { UpdateBanner } from "@/features/updates/update-banner";

describe("update banner", () => {
  it("announces a newer HQBase release outside Settings", () => {
    const status = {
      installedVersion: "0.1.0",
      available: true,
      release: { version: "0.2.0" }
    } as UpdateStatus;
    const html = renderToStaticMarkup(
      <UpdateBanner inProgress={false} ready={false} status={status} onOpen={() => undefined} />
    );
    expect(html).toContain("Update available");
    expect(html).toContain("0.2.0");
    expect(html).toContain("Review update");
    expect(html).toContain('role="status"');
    expect(html).toContain("bg-muted/45");
    expect(html).not.toContain("blue-");
  });

  it("becomes an animated progress banner after the update starts", () => {
    const status = {
      installedVersion: "0.1.0",
      available: true,
      release: { version: "0.2.0" }
    } as UpdateStatus;
    const html = renderToStaticMarkup(
      <UpdateBanner inProgress ready={false} status={status} onOpen={() => undefined} />
    );
    expect(html).toContain("Update in progress");
    expect(html).toContain("animate-spin");
    expect(html).toContain("View progress");
    expect(html).not.toContain("Update available");
  });

  it("keeps persisted update progress visible while status refreshes", () => {
    const html = renderToStaticMarkup(
      <UpdateBanner inProgress ready={false} status={null} onOpen={() => undefined} />
    );
    expect(html).toContain("Update in progress");
    expect(html).toContain("View progress");
  });

  it("disappears when the replacement version is ready to reload", () => {
    const status = {
      installedVersion: "0.1.0",
      available: true,
      release: { version: "0.2.0" }
    } as UpdateStatus;
    const html = renderToStaticMarkup(
      <UpdateBanner inProgress ready status={status} onOpen={() => undefined} />
    );
    expect(html).toBe("");
  });
});
