import type { WorkerEnv } from "@worker/lib/env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  findMailboxForSending: vi.fn(),
  recordAudit: vi.fn(),
  requireDraftAttachmentIdsAccess: vi.fn(),
  requireDraftIdAccess: vi.fn(),
  requireMailApiContext: vi.fn(),
  requireMailboxAccess: vi.fn(),
  sendNewMessage: vi.fn()
}));

vi.mock("@worker/auth/mail-api", () => ({
  requireMailApiContext: mocks.requireMailApiContext
}));
vi.mock("@worker/auth/mailbox-access", () => ({
  requireMailboxAccess: mocks.requireMailboxAccess
}));
vi.mock("@worker/security/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit
}));
vi.mock("@worker/features/audit/service", () => ({
  recordAudit: mocks.recordAudit
}));
vi.mock("@worker/features/drafts/access", () => ({
  requireDraftAttachmentIdsAccess: mocks.requireDraftAttachmentIdsAccess,
  requireDraftIdAccess: mocks.requireDraftIdAccess
}));
vi.mock("@worker/features/mailboxes/queries", () => ({
  findMailboxForSending: mocks.findMailboxForSending
}));
vi.mock("@worker/features/send/service", () => ({
  replyToMessage: vi.fn(),
  sendNewMessage: mocks.sendNewMessage
}));

import { sendRoutes } from "@worker/features/send/routes";

describe("send routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMailApiContext.mockResolvedValue({
      user: { id: "user-1", role: "member" }
    });
    mocks.findMailboxForSending.mockResolvedValue({ id: "mailbox-1" });
    mocks.sendNewMessage.mockResolvedValue({ id: "sent-message-1" });
  });

  it("authorizes the selected sending mailbox before sending a draft", async () => {
    const db = {} as D1Database;
    const response = await sendRoutes.request(
      "/send",
      {
        body: JSON.stringify({
          from: "sender@example.com",
          to: ["reader@example.com"],
          cc: [],
          bcc: [],
          subject: "Fwd: Example",
          text: "Forwarded message",
          html: "<p>Forwarded message</p>",
          attachmentIds: [],
          draftId: "draft-forward"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      },
      {
        BETTER_AUTH_SECRET: "test-secret",
        DB: db
      } as WorkerEnv
    );

    expect(response.status).toBe(201);
    expect(mocks.requireMailboxAccess).toHaveBeenCalledWith(
      db,
      "user-1",
      "member",
      "mailbox-1",
      "agent"
    );
    expect(mocks.sendNewMessage).toHaveBeenCalledOnce();
  });
});
