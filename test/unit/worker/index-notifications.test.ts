import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleInboundEmail: vi.fn(),
  notifyInboundMessage: vi.fn()
}));

vi.mock("@worker/email/inbound", () => ({ handleInboundEmail: mocks.handleInboundEmail }));
vi.mock("@worker/features/notifications/delivery", () => ({
  notifyInboundMessage: mocks.notifyInboundMessage
}));

import worker from "@worker/index";
import type { WorkerEnv } from "@worker/lib/env";

const storedMessage = {
  id: "msg_1",
  mailboxId: "mbx_1",
  threadId: "thr_1"
};

describe("inbound notification scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notifyInboundMessage.mockResolvedValue(undefined);
  });

  it("does not schedule push for a duplicate inbound message", async () => {
    mocks.handleInboundEmail.mockResolvedValue({ inserted: false, message: storedMessage });
    const waitUntil = vi.fn();

    await worker.email(
      {} as ForwardableEmailMessage,
      {} as WorkerEnv,
      { waitUntil } as unknown as ExecutionContext
    );

    expect(mocks.notifyInboundMessage).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("schedules push after a newly stored inbound message", async () => {
    mocks.handleInboundEmail.mockResolvedValue({ inserted: true, message: storedMessage });
    const waitUntil = vi.fn();

    await worker.email(
      {} as ForwardableEmailMessage,
      {} as WorkerEnv,
      { waitUntil } as unknown as ExecutionContext
    );

    expect(mocks.notifyInboundMessage).toHaveBeenCalledWith({}, storedMessage);
    expect(waitUntil).toHaveBeenCalledOnce();
    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
  });
});
