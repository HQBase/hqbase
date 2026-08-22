import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  updateMailDomainSettings,
  upsertMailDomain
} from "../../../worker/features/domains/queries";
import { findAddressIdentity } from "../../../worker/features/mailboxes/address-queries";
import { listMailboxes } from "../../../worker/features/mailboxes/queries";
import { createMailbox } from "../../../worker/features/mailboxes/service";
import { applyCurrentMigrations } from "./current-migrations";

describe("receive-only mailbox identities", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM mailbox_addresses"),
      env.DB.prepare("DELETE FROM mailboxes"),
      env.DB.prepare("DELETE FROM mail_domains")
    ]);
  });

  it("keeps receiving available while hiding sending until the domain is ready", async () => {
    const domain = await upsertMailDomain(env.DB, {
      name: "example.com",
      receivingStatus: "ready",
      sendingStatus: "disabled",
      dnsStatus: "ready"
    });
    await createMailbox(env.DB, {
      address: "support@example.com",
      displayName: "Support"
    });

    expect((await listMailboxes(env.DB))[0]?.addresses[0]).toMatchObject({
      receiveEnabled: true,
      sendEnabled: true,
      sendAvailable: false
    });
    await expect(
      findAddressIdentity(env.DB, "support@example.com", "receive")
    ).resolves.not.toBeNull();
    await expect(findAddressIdentity(env.DB, "support@example.com", "send")).resolves.toBeNull();

    await upsertMailDomain(env.DB, {
      name: "example.com",
      receivingStatus: "ready",
      sendingStatus: "ready",
      dnsStatus: "ready"
    });

    expect((await listMailboxes(env.DB))[0]?.addresses[0]?.sendAvailable).toBe(true);
    await expect(
      findAddressIdentity(env.DB, "support@example.com", "send")
    ).resolves.not.toBeNull();

    await updateMailDomainSettings(env.DB, domain.id, { isEnabled: false });

    expect((await listMailboxes(env.DB))[0]?.addresses[0]?.sendAvailable).toBe(false);
    await expect(findAddressIdentity(env.DB, "support@example.com", "send")).resolves.toBeNull();
  });
});
