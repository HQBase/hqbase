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
        defaultFromMailboxAddress: "hello@example.com",
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
        defaultFromMailboxAddress: "hello@example.com",
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
        defaultFromMailboxAddress: "hello@example.com",
        mailboxes: [{ address: "hello@example.com", displayName: "Hello" }]
      })
    ).toMatchObject({ ownerEmail: "owner@gmail.com" });
  });

  it("rejects an owner Login email on any selected workspace domain", () => {
    expect(() =>
      bootstrapSetupSchema.parse({
        ownerName: "Owner",
        ownerEmail: "owner@example.com",
        ownerPassword: "password123",
        emailDomains: [
          { name: "support.example", sendingStatus: "ready" },
          { name: "example.com", sendingStatus: "ready" }
        ],
        checklistAcknowledged: true,
        defaultFromMailboxAddress: "hello@example.com",
        mailboxes: [{ address: "hello@example.com", displayName: "Hello" }]
      })
    ).toThrow("Use an email account you can always access, even when HQBase is unavailable.");
  });

  it("rejects duplicate bootstrap mailboxes", () => {
    expect(() =>
      bootstrapSetupSchema.parse({
        ownerName: "Owner",
        ownerEmail: "owner@example.com",
        ownerPassword: "password123",
        primaryDomain: "example.com",
        checklistAcknowledged: true,
        defaultFromMailboxAddress: "hello@example.com",
        mailboxes: [
          { address: "Hello@example.com", displayName: "Hello" },
          { address: "hello@example.com", displayName: "Duplicate" }
        ]
      })
    ).toThrow("Mailbox addresses must be unique.");
  });

  it("requires the default From mailbox to be one of the setup mailboxes", () => {
    expect(() =>
      bootstrapSetupSchema.parse({
        ownerName: "Owner",
        ownerEmail: "owner@example.com",
        ownerPassword: "password123",
        primaryDomain: "example.com",
        checklistAcknowledged: true,
        defaultFromMailboxAddress: "privacy@example.com",
        mailboxes: [{ address: "hello@example.com", displayName: "Hello" }]
      })
    ).toThrow("Choose a mailbox on a send-enabled domain as the default From mailbox.");
  });

  it("accepts receive-only setup without a default From mailbox", () => {
    expect(
      bootstrapSetupSchema.parse({
        ownerName: "Owner",
        ownerEmail: "owner@gmail.com",
        ownerPassword: "password123",
        emailDomains: [{ name: "example.com", sendingStatus: "disabled" }],
        checklistAcknowledged: true,
        defaultFromMailboxAddress: null,
        mailboxes: [{ address: "hello@example.com", displayName: "Hello" }]
      })
    ).toMatchObject({ defaultFromMailboxAddress: null });
  });

  it("requires a send-enabled default From mailbox when any domain can send", () => {
    expect(() =>
      bootstrapSetupSchema.parse({
        ownerName: "Owner",
        ownerEmail: "owner@gmail.com",
        ownerPassword: "password123",
        emailDomains: [
          { name: "receive.example", sendingStatus: "disabled" },
          { name: "send.example", sendingStatus: "ready" }
        ],
        checklistAcknowledged: true,
        defaultFromMailboxAddress: "hello@receive.example",
        mailboxes: [
          { address: "hello@receive.example", displayName: "Hello" },
          { address: "support@send.example", displayName: "Support" }
        ]
      })
    ).toThrow("Choose a mailbox on a send-enabled domain as the default From mailbox.");
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
