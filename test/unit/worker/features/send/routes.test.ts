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
  requireMessageAccess: vi.fn(),
  replyToMessage: vi.fn(),
  sendNewMessage: vi.fn()
}));

vi.mock("@worker/auth/mail-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@worker/auth/mail-api")>()),
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
vi.mock("@worker/features/messages/access", () => ({
  requireMessageAccess: mocks.requireMessageAccess
}));
vi.mock("@worker/features/send/service", () => ({
  replyToMessage: mocks.replyToMessage,
  sendNewMessage: mocks.sendNewMessage
}));

import { sendRoutes } from "@worker/features/send/routes";

describe("send routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMailApiContext.mockResolvedValue({
      authentication: { kind: "session", id: "session-1" },
      user: { id: "user-1", role: "member" }
    });
    mocks.findMailboxForSending.mockResolvedValue({ id: "mailbox-1" });
    mocks.requireMessageAccess.mockResolvedValue("agent");
    mocks.replyToMessage.mockResolvedValue({ id: "sent-reply-1" });
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

  it("adds PAT attribution only to a PAT-backed send audit", async () => {
    mocks.requireMailApiContext.mockResolvedValue({
      authentication: { kind: "pat", tokenId: "pat_send_audit" },
      user: { id: "user-1", role: "member" }
    });

    const response = await requestSend();

    expect(response.status).toBe(201);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "message.send",
        metadata: {
          authenticationKind: "pat",
          personalAccessTokenId: "pat_send_audit"
        }
      })
    );
  });

  it("adds PAT attribution only to a PAT-backed reply audit", async () => {
    mocks.requireMailApiContext.mockResolvedValue({
      authentication: { kind: "pat", tokenId: "pat_reply_audit" },
      user: { id: "user-1", role: "member" }
    });

    const response = await requestReply();

    expect(response.status).toBe(201);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "message.reply",
        metadata: {
          authenticationKind: "pat",
          personalAccessTokenId: "pat_reply_audit"
        }
      })
    );
  });

  it.each([
    ["session", { kind: "session", id: "session-1" }],
    ["OAuth", { kind: "oauth", clientId: "client-1" }]
  ] as const)("keeps %s send audit metadata unchanged", async (_label, authentication) => {
    mocks.requireMailApiContext.mockResolvedValue({
      authentication,
      user: { id: "user-1", role: "member" }
    });

    const response = await requestSend();

    expect(response.status).toBe(201);
    const audit = mocks.recordAudit.mock.calls[0]?.[1];
    expect(audit).not.toHaveProperty("metadata");
  });
});

function requestSend(): Promise<Response> {
  return Promise.resolve(
    sendRoutes.request(
      "/send",
      {
        body: JSON.stringify({
          from: "sender@example.com",
          to: ["reader@example.com"],
          subject: "Audit send",
          text: "Audit send body"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      },
      {
        BETTER_AUTH_SECRET: "test-secret",
        DB: {} as D1Database
      } as WorkerEnv
    )
  );
}

function requestReply(): Promise<Response> {
  return Promise.resolve(
    sendRoutes.request(
      "/reply",
      {
        body: JSON.stringify({
          from: "sender@example.com",
          messageId: "message-1",
          text: "Audit reply body"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      },
      {
        BETTER_AUTH_SECRET: "test-secret",
        DB: {} as D1Database
      } as WorkerEnv
    )
  );
}
