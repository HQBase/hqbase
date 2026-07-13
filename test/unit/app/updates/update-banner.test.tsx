import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UpdateStatus } from "@/features/updates/types";
import { UpdateBanner } from "@/features/updates/update-banner";

describe("update banner", () => {
  it("announces a newer release outside Settings", () => {
    const status = {
      installedVersion: "0.1.0",
      available: true,
      release: { version: "0.2.0" }
    } as UpdateStatus;
    const html = renderToStaticMarkup(<UpdateBanner status={status} onOpen={() => undefined} />);
    expect(html).toContain("Update available");
    expect(html).toContain("0.2.0");
    expect(html).toContain("Review update");
  });
  it("stays absent when current", () => {
    expect(renderToStaticMarkup(<UpdateBanner status={null} onOpen={() => undefined} />)).toBe("");
  });
});
