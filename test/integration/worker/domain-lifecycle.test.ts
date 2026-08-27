import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { getSetting, setSetting } from "../../../worker/db/client";
import { getRow } from "../../../worker/db/drizzle";
import { resolveInboundRoute } from "../../../worker/email/inbound-route";
import {
  disconnectMailDomain,
  forgetMailDomain
} from "../../../worker/features/domains/lifecycle-service";
import {
  findMailDomainById,
  findMailDomainByName,
  updateMailDomainSettings,
  upsertMailDomain
} from "../../../worker/features/domains/queries";
import { findMailboxById } from "../../../worker/features/mailboxes/queries";
import { createMailbox } from "../../../worker/features/mailboxes/service";
import { applyCurrentMigrations } from "./current-migrations";

describe("email domain lifecycle", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  it("disconnects new mail while preserving mailbox history", async () => {
    const domain = await readyDomain("disconnect-history.example");
    const mailbox = await createMailbox(env.DB, {
      address: "hello@disconnect-history.example",
      displayName: "Hello"
    });
    await updateMailDomainSettings(env.DB, domain.id, {
      catchAllPolicy: "mailbox",
      catchAllMailboxId: mailbox.id
    });

    const disconnected = await disconnectMailDomain(
      env.DB,
      domain.id,
      audit("domain.disconnect", domain.id)
    );

    expect(disconnected).toMatchObject({
      catchAllMailboxId: null,
      catchAllPolicy: "reject",
      disconnectedAt: expect.any(String),
      isEnabled: false,
      receivingStatus: "disabled",
      sendingStatus: "disabled"
    });
    await expect(findMailboxById(env.DB, mailbox.id)).resolves.toMatchObject({ id: mailbox.id });
    await expect(resolveInboundRoute(env.DB, mailbox.address)).resolves.toEqual({
      action: "reject"
    });
    await expect(
      updateMailDomainSettings(env.DB, domain.id, { isEnabled: true })
    ).rejects.toMatchObject({ code: "DOMAIN_DISCONNECTED", status: 409 });
  });

  it("blocks forgetting a disconnected domain that still has mailbox history", async () => {
    const domain = await readyDomain("forget-blocked.example");
    await createMailbox(env.DB, {
      address: "hello@forget-blocked.example",
      displayName: "Hello"
    });
    await disconnectMailDomain(env.DB, domain.id, audit("domain.disconnect", domain.id));

    await expect(
      forgetMailDomain(env.DB, domain.id, domain.name, audit("domain.forget", domain.id))
    ).rejects.toMatchObject({ code: "DOMAIN_NOT_EMPTY", status: 409 });
  });

  it("reconnects through the existing domain upsert without restoring an old catch-all mailbox", async () => {
    const domain = await readyDomain("reconnect-domain.example");
    await disconnectMailDomain(env.DB, domain.id, audit("domain.disconnect", domain.id));

    await expect(readyDomain(domain.name)).resolves.toMatchObject({
      catchAllMailboxId: null,
      catchAllPolicy: "reject",
      disconnectedAt: null,
      isEnabled: true,
      receivingStatus: "ready",
      sendingStatus: "ready"
    });
  });

  it("forgets an empty disconnected domain and promotes another primary domain", async () => {
    const domain = await readyDomain("forget-primary.example");
    await readyDomain("forget-replacement.example");
    await setSetting(env.DB, "primary_domain", domain.name);
    await disconnectMailDomain(env.DB, domain.id, audit("domain.disconnect", domain.id));

    await forgetMailDomain(env.DB, domain.id, domain.name, audit("domain.forget", domain.id));

    await expect(findMailDomainById(env.DB, domain.id)).resolves.toBeNull();
    const primary = await getSetting(env.DB, "primary_domain", z.string());
    expect(primary).not.toBe(domain.name);
    if (!primary) throw new Error("A replacement primary domain was not saved.");
    await expect(findMailDomainByName(env.DB, primary)).resolves.toMatchObject({
      disconnectedAt: null
    });
    await expect(
      getRow<{ count: number }>(
        env.DB,
        sql`SELECT COUNT(*) AS count FROM audit_events
            WHERE action = 'domain.forget' AND resource_id = ${domain.id}`
      )
    ).resolves.toEqual({ count: 1 });
  });
});

async function readyDomain(name: string) {
  return upsertMailDomain(env.DB, {
    dnsStatus: "ready",
    name,
    receivingStatus: "ready",
    sendingStatus: "ready"
  });
}

function audit(action: string, resourceId: string) {
  return {
    action,
    actorId: "user_owner",
    actorType: "user" as const,
    correlationId: `request_${resourceId}`,
    outcome: "success" as const,
    resourceId,
    resourceType: "domain"
  };
}
