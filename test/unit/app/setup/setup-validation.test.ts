import { describe, expect, it } from "vitest";

import { buildDomainAddress } from "@/features/setup/setup-helpers";
import {
  hasErrors,
  hasMailboxErrors,
  validateDomain,
  validateMailboxes,
  validateOwner,
  validateToken
} from "@/features/setup/setup-validation";
import type { CloudflareZone } from "@/features/setup/types";

const activeZone: CloudflareZone = {
  accountId: "account-1",
  accountName: "Example",
  id: "zone-1",
  name: "example.com",
  status: "active",
  type: "full"
};

describe("setup form validation", () => {
  it("builds the owner sign-in address from the editable local part and selected domain", () => {
    expect(buildDomainAddress(" Oleg ", "Example.COM")).toBe("oleg@example.com");
    expect(buildDomainAddress("", "example.com")).toBe("");
  });

  it("blocks invalid owner details before the mailbox step", () => {
    expect(
      validateOwner({ email: "not-an-email", name: "", password: "short" }, "example.com")
    ).toEqual({
      email: "Choose a valid address before @example.com.",
      name: "Enter your name.",
      password: "Use at least 8 characters."
    });
  });

  it("requires the owner sign-in address to use the selected domain", () => {
    expect(
      validateOwner(
        {
          email: "owner@gmail.com",
          name: "Workspace Owner",
          password: "a-secure-password"
        },
        "example.com"
      )
    ).toEqual({ email: "Choose a valid address before @example.com." });

    expect(
      hasErrors(
        validateOwner(
          {
            email: "owner@example.com",
            name: "Workspace Owner",
            password: "a-secure-password"
          },
          "example.com"
        )
      )
    ).toBe(false);
  });

  it("validates domain selection and the required app hostname", () => {
    expect(
      validateDomain({
        appSubdomain: "bad subdomain",
        selectedZone: null
      })
    ).toEqual({
      appSubdomain: "Use one DNS label, such as hqbase or inbox.",
      selectedZoneId: "Choose the domain that will receive your shared email."
    });

    expect(
      hasErrors(
        validateDomain({
          appSubdomain: "hqbase",
          selectedZone: activeZone
        })
      )
    ).toBe(false);
  });

  it("rejects values that do not look like Cloudflare tokens", () => {
    expect(validateToken("")).toBe("Paste the token from Cloudflare.");
    expect(validateToken("too-short")).toBe("This does not look like a Cloudflare API token.");
    expect(validateToken("a".repeat(40))).toBeNull();
  });

  it("shows mailbox address, domain, display-name, and duplicate errors", () => {
    const errors = validateMailboxes(
      [
        { address: "support@wrong.com", displayName: "" },
        { address: "hello@example.com", displayName: "Hello" },
        { address: "HELLO@example.com", displayName: "Duplicate" }
      ],
      "example.com"
    );

    expect(errors.rows).toEqual([
      {
        address: "Use an address ending in @example.com.",
        displayName: "Enter a display name."
      },
      { address: "Each mailbox address must be unique." },
      { address: "Each mailbox address must be unique." }
    ]);
    expect(hasMailboxErrors(errors)).toBe(true);
  });

  it("accepts complete shared mailboxes", () => {
    expect(
      hasMailboxErrors(
        validateMailboxes(
          [
            { address: "support@example.com", displayName: "Support" },
            { address: "privacy@example.com", displayName: "Privacy" }
          ],
          "example.com"
        )
      )
    ).toBe(false);
  });
});
