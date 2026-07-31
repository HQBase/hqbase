import { describe, expect, it } from "vitest";

import {
  defaultMailboxesForDomains,
  syncMailboxesForDomains
} from "@/features/setup/setup-helpers";
import {
  hasErrors,
  hasMailboxErrors,
  validateDomain,
  validateMailboxes,
  validateOwner
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
  it("creates the default mailbox set for every selected domain", () => {
    expect(defaultMailboxesForDomains(["Example.com", "team.example"])).toEqual([
      { address: "support@example.com", displayName: "Support" },
      { address: "privacy@example.com", displayName: "Privacy" },
      { address: "support@team.example", displayName: "Support" },
      { address: "privacy@team.example", displayName: "Privacy" }
    ]);
  });

  it("syncs generated defaults while preserving edited and custom mailboxes", () => {
    expect(
      syncMailboxesForDomains(
        [
          { address: "support@old.example", displayName: "Support" },
          { address: "privacy@old.example", displayName: "Legal" },
          { address: "hello@old.example", displayName: "Hello" }
        ],
        ["old.example"],
        ["new.example"]
      )
    ).toEqual([
      { address: "privacy@old.example", displayName: "Legal" },
      { address: "hello@old.example", displayName: "Hello" },
      { address: "support@new.example", displayName: "Support" },
      { address: "privacy@new.example", displayName: "Privacy" }
    ]);
  });

  it("blocks invalid owner details before the mailbox step", () => {
    expect(validateOwner({ email: "not-an-email", name: "", password: "short" })).toEqual({
      email: "Enter a valid Login email.",
      name: "Enter your name.",
      password: "Use at least 8 characters."
    });
  });

  it("allows the owner sign-in address to use a separate domain", () => {
    expect(
      validateOwner(
        {
          email: "owner@gmail.com",
          name: "Workspace Owner",
          password: "a-secure-password"
        },
        ["example.com"]
      )
    ).toEqual({});
  });

  it("rejects an owner Login email on any selected workspace domain", () => {
    expect(
      validateOwner(
        {
          email: "owner@example.com",
          name: "Workspace Owner",
          password: "a-secure-password"
        },
        ["support.example", "EXAMPLE.COM"]
      )
    ).toEqual({
      email:
        "Use an email account you can always access, even when HQBase is unavailable. It cannot use a domain connected to this workspace."
    });
  });

  it("validates domain selection and the required app hostname", () => {
    expect(
      validateDomain({
        appSubdomain: "bad subdomain",
        selectedZones: [],
        portalZone: null
      })
    ).toEqual({
      appSubdomain: "Use one DNS label, such as hqbase or inbox.",
      selectedZoneIds: "Choose at least one email domain.",
      portalZoneId: "Choose which selected domain hosts the workspace portal."
    });

    expect(
      hasErrors(
        validateDomain({
          appSubdomain: "hqbase",
          selectedZones: [activeZone],
          portalZone: activeZone
        })
      )
    ).toBe(false);

    expect(
      validateDomain({
        appSubdomain: "hqbase",
        selectedZones: Array.from({ length: 11 }, (_, index) => ({
          ...activeZone,
          id: `zone-${index}`,
          name: `domain-${index}.example`
        })),
        portalZone: activeZone
      })
    ).toMatchObject({ selectedZoneIds: "Choose up to 10 email domains during setup." });
  });

  it("shows mailbox address, domain, display-name, and duplicate errors", () => {
    const errors = validateMailboxes(
      [
        { address: "support@wrong.com", displayName: "" },
        { address: "hello@example.com", displayName: "Hello" },
        { address: "HELLO@example.com", displayName: "Duplicate" }
      ],
      ["example.com"]
    );

    expect(errors.rows).toEqual([
      {
        address: "Use one of the connected email domains.",
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
          ["example.com"]
        )
      )
    ).toBe(false);
  });
});
