import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseRawEmail: vi.fn(),
  resolveInboundRoute: vi.fn(),
  storeInboundEmail: vi.fn()
}));

vi.mock("@worker/email/inbound-route", () => ({
  resolveInboundRoute: mocks.resolveInboundRoute
}));
vi.mock("@worker/email/parse-email", () => ({ parseRawEmail: mocks.parseRawEmail }));
vi.mock("@worker/email/store-email", () => ({ storeInboundEmail: mocks.storeInboundEmail }));

import { handleInboundEmail } from "@worker/email/inbound";
import type { WorkerEnv } from "@worker/lib/env";

describe("inbound catch-all policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unknown recipient before it reads or stores the message", async () => {
    mocks.resolveInboundRoute.mockResolvedValue({ action: "reject" });
    const message = emailMessage("unknown@example.com");

    await expect(handleInboundEmail(message, workerEnv())).resolves.toBeNull();

    expect(message.setReject).toHaveBeenCalledWith("Unknown recipient.");
    expect(mocks.parseRawEmail).not.toHaveBeenCalled();
    expect(mocks.storeInboundEmail).not.toHaveBeenCalled();
  });

  it("passes the resolved mailbox to normal inbound storage", async () => {
    mocks.resolveInboundRoute.mockResolvedValue({ action: "store", mailboxId: "mbx_contact" });
    const parsed = { subject: "Hello" };
    const stored = { inserted: true, isUnassigned: false, message: { id: "msg_1" } };
    mocks.parseRawEmail.mockResolvedValue(parsed);
    mocks.storeInboundEmail.mockResolvedValue(stored);
    const env = workerEnv();

    await expect(handleInboundEmail(emailMessage("alias@example.com"), env)).resolves.toBe(stored);

    expect(mocks.storeInboundEmail).toHaveBeenCalledWith(
      env.DB,
      env.MAIL_OBJECTS,
      expect.objectContaining({
        envelopeRecipient: "alias@example.com",
        mailboxId: "mbx_contact",
        parsed
      })
    );
  });
});

function emailMessage(to: string): ForwardableEmailMessage {
  return {
    from: "sender@example.net",
    headers: new Headers(),
    raw: new Response("raw message").body,
    rawSize: 11,
    setReject: vi.fn(),
    forward: vi.fn(),
    reply: vi.fn(),
    to
  } as unknown as ForwardableEmailMessage;
}

function workerEnv(): WorkerEnv {
  return {
    DB: { name: "DB" },
    MAIL_OBJECTS: { name: "MAIL_OBJECTS" }
  } as unknown as WorkerEnv;
}
