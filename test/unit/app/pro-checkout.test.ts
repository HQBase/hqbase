import { describe, expect, it } from "vitest";
import { proCheckoutBaseUrl, proCheckoutUrl } from "@/lib/pro-checkout";

describe("Pro checkout attribution", () => {
  it("starts a purchase-bound Community upgrade through Billing", () => {
    expect(proCheckoutBaseUrl).toBe("https://billing.hqbase.io/buy/pro");
  });

  it("attributes every upgrade placement without changing the checkout host", () => {
    const url = new URL(proCheckoutUrl("user-permissions"));
    expect(url.origin).toBe("https://billing.hqbase.io");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mode: "community_upgrade",
      source: "hqbase-community",
      placement: "user-permissions"
    });
  });
});
