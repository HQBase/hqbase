import {
  bootstrapSetupSchema,
  configureCloudflareDomainSchema,
  listCloudflareZonesSchema
} from "@worker/features/setup/validation";
import { describe, expect, it } from "vitest";

describe("setup API validation", () => {
  it("requires checklist acknowledgement", () => {
    expect(() =>
      bootstrapSetupSchema.parse({
        ownerName: "Owner",
        ownerEmail: "owner@example.com",
        ownerPassword: "password123",
        primaryDomain: "example.com",
        checklistAcknowledged: false,
        mailboxes: [{ address: "hello@example.com", displayName: "Hello" }]
      })
    ).toThrow();
  });

  it("rejects invalid domains", () => {
    expect(() =>
      bootstrapSetupSchema.parse({
        ownerName: "Owner",
        ownerEmail: "owner@example.com",
        ownerPassword: "password123",
        primaryDomain: "bad domain",
        checklistAcknowledged: true,
        mailboxes: [{ address: "hello@example.com", displayName: "Hello" }]
      })
    ).toThrow();
  });

  it("allows the owner sign-in address to use a separate domain", () => {
    expect(
      bootstrapSetupSchema.parse({
        ownerName: "Owner",
        ownerEmail: "owner@gmail.com",
        ownerPassword: "password123",
        primaryDomain: "example.com",
        checklistAcknowledged: true,
        mailboxes: [{ address: "hello@example.com", displayName: "Hello" }]
      })
    ).toMatchObject({ ownerEmail: "owner@gmail.com" });
  });

  it("rejects duplicate bootstrap mailboxes", () => {
    expect(() =>
      bootstrapSetupSchema.parse({
        ownerName: "Owner",
        ownerEmail: "owner@example.com",
        ownerPassword: "password123",
        primaryDomain: "example.com",
        checklistAcknowledged: true,
        mailboxes: [
          { address: "Hello@example.com", displayName: "Hello" },
          { address: "hello@example.com", displayName: "Duplicate" }
        ]
      })
    ).toThrow("Mailbox addresses must be unique.");
  });

  it("rejects credentials in Cloudflare zone listing input", () => {
    expect(() => listCloudflareZonesSchema.parse({ apiToken: "a".repeat(40) })).toThrow();
    expect(listCloudflareZonesSchema.parse({})).toEqual({});
  });

  it("defaults Cloudflare Email Sending automation on", () => {
    expect(
      configureCloudflareDomainSchema.parse({
        appHostname: "hqbase.example.com",
        workerName: "hqbase",
        zoneId: "zone-1"
      })
    ).toEqual({
      appHostname: "hqbase.example.com",
      attachCustomDomain: true,
      enableSending: true,
      workerName: "hqbase",
      zoneId: "zone-1"
    });
  });

  it("requires the app custom domain only when attaching it", () => {
    expect(() =>
      configureCloudflareDomainSchema.parse({
        workerName: "hqbase",
        zoneId: "zone-1"
      })
    ).toThrow();

    expect(
      configureCloudflareDomainSchema.parse({
        appHostname: "hqbase.example.com",
        attachCustomDomain: false,
        workerName: "hqbase",
        zoneId: "zone-1"
      })
    ).toMatchObject({ attachCustomDomain: false });
  });
});
