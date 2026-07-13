import { describe, expect, it } from "vitest";
import { proCheckoutBaseUrl, proCheckoutUrl } from "@/lib/pro-checkout";

describe("Pro checkout attribution", () => {
  it("uses the single production Polar checkout link", () => {
    expect(proCheckoutBaseUrl).toMatch(/^https:\/\/buy\.polar\.sh\/polar_cl_/);
  });

  it("attributes every upgrade placement without changing the checkout host", () => {
    const url = new URL(proCheckoutUrl("user-permissions"));
    expect(url.origin).toBe("https://buy.polar.sh");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: "hqbase-community",
      utm_medium: "product",
      utm_campaign: "community-upgrade",
      utm_content: "user-permissions"
    });
  });
});
