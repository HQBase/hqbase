import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { resolveInboundRoute } from "../../../worker/email/inbound-route";
import type { ParsedEmail } from "../../../worker/email/parse-email";
import { storeInboundEmail } from "../../../worker/email/store-email";
import {
  updateMailDomainReadiness,
  updateMailDomainSettings,
  upsertMailDomain
} from "../../../worker/features/domains/queries";
import { softDeleteMailbox } from "../../../worker/features/mailboxes/lifecycle-service";
import { createMailbox, updateExistingMailbox } from "../../../worker/features/mailboxes/service";
import { applyCurrentMigrations } from "./current-migrations";

describe("catch-all domain policy", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
  });

  it("routes exact addresses before the domain fallback", async () => {
    const domain = await readyDomain("route-exact.example");
    const mailbox = await createMailbox(env.DB, {
      address: "support@route-exact.example",
      displayName: "Support"
    });
    await updateMailDomainSettings(env.DB, domain.id, { catchAllPolicy: "reject" });

    await expect(resolveInboundRoute(env.DB, mailbox.address)).resolves.toEqual({
      action: "store",
      mailboxId: mailbox.id
    });
    await expect(resolveInboundRoute(env.DB, "unknown@route-exact.example")).resolves.toEqual({
      action: "reject"
    });
  });

  it("supports owner review and one active human mailbox per domain", async () => {
    const domain = await readyDomain("route-policy.example");
    await readyDomain("route-other.example");
    const mailbox = await createMailbox(env.DB, {
      address: "contact@route-policy.example",
      displayName: "Contact"
    });
    const otherMailbox = await createMailbox(env.DB, {
      address: "contact@route-other.example",
      displayName: "Other"
    });

    await updateMailDomainSettings(env.DB, domain.id, { catchAllPolicy: "unassigned" });
    await expect(resolveInboundRoute(env.DB, "hello@route-policy.example")).resolves.toEqual({
      action: "store",
      mailboxId: null
    });

    await expect(
      updateMailDomainSettings(env.DB, domain.id, {
        catchAllPolicy: "mailbox",
        catchAllMailboxId: otherMailbox.id
      })
    ).rejects.toMatchObject({ code: "CATCH_ALL_MAILBOX_INVALID", status: 400 });

    const now = "2026-08-26T12:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO mailboxes
       (id, address, mail_domain_id, display_name, kind, is_active, created_at, updated_at)
       VALUES ('mbx_catchall_agent', 'agent@route-policy.example', ?, 'Agent', 'agent', 1, ?, ?)`
    )
      .bind(domain.id, now, now)
      .run();
    await expect(
      updateMailDomainSettings(env.DB, domain.id, {
        catchAllPolicy: "mailbox",
        catchAllMailboxId: "mbx_catchall_agent"
      })
    ).rejects.toMatchObject({ code: "CATCH_ALL_MAILBOX_INVALID", status: 400 });

    await updateMailDomainSettings(env.DB, domain.id, {
      catchAllPolicy: "mailbox",
      catchAllMailboxId: mailbox.id
    });
    await expect(resolveInboundRoute(env.DB, "hello@route-policy.example")).resolves.toEqual({
      action: "store",
      mailboxId: mailbox.id
    });
  });

  it("falls back safely if stored mailbox policy data is no longer valid", async () => {
    const domain = await readyDomain("route-invalid.example");
    const otherDomain = await readyDomain("route-invalid-other.example");
    const otherMailbox = await createMailbox(env.DB, {
      address: "contact@route-invalid-other.example",
      displayName: "Other"
    });
    await env.DB.prepare(
      `UPDATE mail_domains
       SET catch_all_policy = 'mailbox', catch_all_mailbox_id = ?
       WHERE id = ?`
    )
      .bind(otherMailbox.id, domain.id)
      .run();

    await expect(resolveInboundRoute(env.DB, "hello@route-invalid.example")).resolves.toEqual({
      action: "store",
      mailboxId: null
    });

    expect(otherDomain.id).not.toBe(domain.id);
  });

  it("stores assigned catch-all mail as normal mailbox Inbox mail", async () => {
    const domain = await readyDomain("route-store.example");
    const mailbox = await createMailbox(env.DB, {
      address: "contact@route-store.example",
      displayName: "Contact"
    });
    await updateMailDomainSettings(env.DB, domain.id, {
      catchAllPolicy: "mailbox",
      catchAllMailboxId: mailbox.id
    });
    const route = await resolveInboundRoute(env.DB, "sales@route-store.example");
    if (route.action !== "store") throw new Error("Expected the message to be stored.");

    const result = await storeInboundEmail(env.DB, env.MAIL_OBJECTS, {
      envelopeRecipient: "sales@route-store.example",
      mailboxId: route.mailboxId,
      parsed: parsedEmail,
      raw: new TextEncoder().encode("From: sender@example.net\r\n\r\nHello").buffer
    });

    expect(result).toMatchObject({
      inserted: true,
      isUnassigned: false,
      message: {
        deliveredToAddress: "sales@route-store.example",
        folder: "inbox",
        mailboxId: mailbox.id
      }
    });
  });

  it("requires a replacement before disabling or deleting the destination", async () => {
    const domain = await readyDomain("route-lifecycle.example");
    const mailbox = await createMailbox(env.DB, {
      address: "contact@route-lifecycle.example",
      displayName: "Contact"
    });
    await updateMailDomainSettings(env.DB, domain.id, {
      catchAllPolicy: "mailbox",
      catchAllMailboxId: mailbox.id
    });

    await expect(
      updateExistingMailbox(env.DB, mailbox.id, { isActive: false })
    ).rejects.toMatchObject({ code: "CATCH_ALL_MAILBOX_IN_USE", status: 409 });
    await expect(
      softDeleteMailbox(env.DB, mailbox.id, {
        action: "mailbox.delete",
        actorId: "user_owner",
        actorType: "user",
        correlationId: "request_catchall_policy",
        outcome: "success",
        resourceId: mailbox.id,
        resourceType: "mailbox"
      })
    ).rejects.toMatchObject({ code: "CATCH_ALL_MAILBOX_IN_USE", status: 409 });

    await updateMailDomainSettings(env.DB, domain.id, { catchAllPolicy: "unassigned" });
    await expect(
      updateExistingMailbox(env.DB, mailbox.id, { isActive: false })
    ).resolves.toMatchObject({ id: mailbox.id, isActive: false });
  });

  it("refreshes readiness without changing the domain policy or active state", async () => {
    const domain = await readyDomain("route-recheck.example");
    const mailbox = await createMailbox(env.DB, {
      address: "contact@route-recheck.example",
      displayName: "Contact"
    });
    await updateMailDomainSettings(env.DB, domain.id, {
      catchAllPolicy: "mailbox",
      catchAllMailboxId: mailbox.id,
      isEnabled: false
    });

    await expect(
      updateMailDomainReadiness(env.DB, domain.id, {
        accountId: "account-rechecked",
        dnsStatus: "ready",
        receivingStatus: "degraded",
        sendingStatus: "ready",
        zoneId: "zone-rechecked"
      })
    ).resolves.toMatchObject({
      accountId: "account-rechecked",
      catchAllMailboxId: mailbox.id,
      catchAllPolicy: "mailbox",
      dnsStatus: "ready",
      isEnabled: false,
      receivingStatus: "degraded",
      sendingStatus: "ready",
      zoneId: "zone-rechecked"
    });
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

const parsedEmail: ParsedEmail = {
  attachments: [],
  bcc: [],
  cc: [],
  date: "2026-08-26T12:00:00.000Z",
  fromAddress: "sender@example.net",
  fromName: "Sender",
  htmlBody: null,
  inReplyTo: null,
  messageId: "<catchall-policy@example.net>",
  references: [],
  snippet: "Hello",
  subject: "Catch-all policy",
  textBody: "Hello",
  to: []
};
