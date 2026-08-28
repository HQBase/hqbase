import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  findMailboxForReceiving,
  findMailboxForSending,
  listMailboxesForUser
} from "../../../worker/features/mailboxes/queries";
import { createMailbox } from "../../../worker/features/mailboxes/service";
import { sendNewMessage } from "../../../worker/features/send/service";
import type { WorkerEnv } from "../../../worker/lib/env";
import { applyCurrentMigrations } from "./current-migrations";

const timestamp = "2026-08-23T12:00:00.000Z";

describe("one-address mailboxes", () => {
  beforeAll(async () => {
    await applyCurrentMigrations();
    await env.DB.batch([
      domainStatement("dom_ready", "ready.example", "ready", "ready", true),
      domainStatement("dom_pending", "pending.example", "pending", "pending", true),
      domainStatement("dom_disabled", "disabled.example", "ready", "ready", false)
    ]);
  });

  it("normalizes creation and rejects duplicate addresses deterministically", async () => {
    const created = await createMailbox(env.DB, {
      address: " Support@READY.EXAMPLE ",
      displayName: "Support"
    });

    expect(created).toMatchObject({
      address: "support@ready.example",
      displayName: "Support",
      mailDomainId: "dom_ready"
    });

    const attempts = await Promise.allSettled([
      createMailbox(env.DB, {
        address: "duplicate@ready.example",
        displayName: "Duplicate A"
      }),
      createMailbox(env.DB, {
        address: "DUPLICATE@READY.EXAMPLE",
        displayName: "Duplicate B"
      })
    ]);
    const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected"
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: "MAILBOX_EXISTS", status: 409 });

    const duplicateCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM mailboxes WHERE address = 'duplicate@ready.example'"
    ).first<{ count: number }>();
    expect(duplicateCount?.count).toBe(1);

    const listed = await listMailboxesForUser(env.DB, "unused-owner-id", "owner");
    expect(listed.find((mailbox) => mailbox.id === created.id)).toMatchObject({
      accessLevel: "manager",
      address: "support@ready.example",
      mailDomainId: "dom_ready"
    });
    expect(listed.find((mailbox) => mailbox.id === created.id)).not.toHaveProperty("addresses");
  });

  it("allows creation while an enabled domain is pending but rejects disabled or missing domains", async () => {
    const pending = await createMailbox(env.DB, {
      address: "help@pending.example",
      displayName: "Pending"
    });

    expect(pending.mailDomainId).toBe("dom_pending");
    await expect(findMailboxForReceiving(env.DB, pending.address)).resolves.toBeNull();
    await expect(findMailboxForSending(env.DB, pending.address)).resolves.toBeNull();

    await expect(
      createMailbox(env.DB, {
        address: "help@disabled.example",
        displayName: "Disabled domain"
      })
    ).rejects.toMatchObject({ code: "DOMAIN_NOT_REGISTERED", status: 400 });
    await expect(
      createMailbox(env.DB, {
        address: "help@missing.example",
        displayName: "Missing domain"
      })
    ).rejects.toMatchObject({ code: "DOMAIN_NOT_REGISTERED", status: 400 });
  });

  it("applies mailbox activity and domain readiness at the receive and send boundaries", async () => {
    const mailbox = await createMailbox(env.DB, {
      address: "status@ready.example",
      displayName: "Status"
    });
    const send = vi.fn();
    const sendEnv = {
      DB: env.DB,
      MAIL_SENDER: { send }
    } as unknown as WorkerEnv;
    const outbound = {
      attachmentIds: [],
      bcc: [],
      cc: [],
      from: mailbox.address,
      subject: "Status",
      text: "Status",
      to: ["recipient@example.net"]
    };

    await expect(findMailboxForReceiving(env.DB, mailbox.address)).resolves.toMatchObject({
      id: mailbox.id
    });
    await expect(findMailboxForSending(env.DB, mailbox.address)).resolves.toMatchObject({
      id: mailbox.id
    });

    await env.DB.prepare("UPDATE mailboxes SET is_active = 0 WHERE id = ?").bind(mailbox.id).run();
    await expect(findMailboxForReceiving(env.DB, mailbox.address)).resolves.toBeNull();
    await expect(sendNewMessage(sendEnv, outbound)).rejects.toMatchObject({
      code: "MAILBOX_DISABLED",
      status: 400
    });

    await env.DB.prepare("UPDATE mailboxes SET is_active = 1 WHERE id = ?").bind(mailbox.id).run();
    await env.DB.prepare(
      "UPDATE mail_domains SET receiving_status = 'degraded' WHERE id = 'dom_ready'"
    ).run();
    await expect(findMailboxForReceiving(env.DB, mailbox.address)).resolves.toBeNull();
    await expect(findMailboxForSending(env.DB, mailbox.address)).resolves.toMatchObject({
      id: mailbox.id
    });

    await env.DB.prepare(
      "UPDATE mail_domains SET receiving_status = 'ready', sending_status = 'degraded' WHERE id = 'dom_ready'"
    ).run();
    await expect(findMailboxForReceiving(env.DB, mailbox.address)).resolves.toMatchObject({
      id: mailbox.id
    });
    await expect(findMailboxForSending(env.DB, mailbox.address)).resolves.toBeNull();
    await expect(sendNewMessage(sendEnv, outbound)).rejects.toMatchObject({
      code: "MAILBOX_NOT_FOUND",
      status: 404
    });

    await env.DB.prepare(
      "UPDATE mail_domains SET sending_status = 'ready', is_enabled = 0 WHERE id = 'dom_ready'"
    ).run();
    await expect(findMailboxForReceiving(env.DB, mailbox.address)).resolves.toBeNull();
    await expect(findMailboxForSending(env.DB, mailbox.address)).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});

function domainStatement(
  id: string,
  name: string,
  receivingStatus: "pending" | "ready",
  sendingStatus: "pending" | "ready",
  isEnabled: boolean
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO mail_domains
     (id, name, receiving_status, sending_status, dns_status, is_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'ready', ?, ?, ?)`
  ).bind(id, name, receivingStatus, sendingStatus, isEnabled ? 1 : 0, timestamp, timestamp);
}
