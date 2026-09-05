vi.mock("@worker/features/send/operations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@worker/features/send/operations")>()),
  resumeSend: vi.fn().mockResolvedValue(null)
}));

import type { WorkerEnv } from "@worker/lib/env";
import { errorBody, toAppError } from "@worker/lib/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accessibleMessageScope: vi.fn(),
  enforceRateLimit: vi.fn(),
  findMailboxForSending: vi.fn(),
  forwardMessage: vi.fn(),
  getAccessibleDraft: vi.fn(),
  recordAudit: vi.fn(),
  replyToMessage: vi.fn(),
  requireDraftAttachmentIdsAccess: vi.fn(),
  requireDraftIdAccess: vi.fn(),
  requireMailApiPrincipal: vi.fn(),
  requireMailboxAccess: vi.fn(),
  requireMessageAccess: vi.fn(),
  scheduleSentMailEvents: vi.fn(),
  sendForwardDraft: vi.fn(),
  sendNewMessage: vi.fn()
}));

vi.mock("@worker/auth/mail-api", () => ({
  requireMailApiPrincipal: mocks.requireMailApiPrincipal
}));
vi.mock("@worker/auth/mailbox-access", () => ({
  accessibleMessageScope: mocks.accessibleMessageScope,
  requireMailboxAccess: mocks.requireMailboxAccess
}));
vi.mock("@worker/security/rate-limit", () => ({
  enforceRateLimit: mocks.enforceRateLimit
}));
vi.mock("@worker/features/audit/service", () => ({
  recordAudit: mocks.recordAudit
}));
vi.mock("@worker/features/drafts/access", () => ({
  getAccessibleDraft: mocks.getAccessibleDraft,
  requireDraftAttachmentIdsAccess: mocks.requireDraftAttachmentIdsAccess,
  requireDraftIdAccess: mocks.requireDraftIdAccess
}));
vi.mock("@worker/features/events/service", () => ({
  scheduleSentMailEvents: mocks.scheduleSentMailEvents
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
vi.mock("@worker/features/send/forward", () => ({
  forwardMessage: mocks.forwardMessage,
  sendForwardDraft: mocks.sendForwardDraft
}));

import { sendRoutes } from "@worker/features/send/routes";

sendRoutes.onError((error) => {
  const appError = toAppError(error);
  return Response.json(errorBody(appError.code, appError.message), { status: appError.status });
});

const noSignature = { mode: "none", id: null, name: "", html: "", text: "" } as const;

describe("send routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordAudit.mockResolvedValue(undefined);
    mocks.requireMailApiPrincipal.mockResolvedValue({
      principal: {
        email: "person@example.com",
        id: "user-1",
        name: "Person",
        role: "member",
        type: "user"
      }
    });
    mocks.findMailboxForSending.mockResolvedValue({ id: "mailbox-1" });
    mocks.accessibleMessageScope.mockResolvedValue({
      includeUnassigned: false,
      mailboxIds: ["mailbox-1"]
    });
    mocks.getAccessibleDraft.mockResolvedValue({
      forwardOfMessageId: null,
      from: "sender@example.com",
      id: "draft-forward",
      signature: noSignature
    });
    mocks.sendForwardDraft.mockResolvedValue({ id: "sent-message-1" });
    mocks.forwardMessage.mockResolvedValue({ id: "sent-message-1" });
    mocks.sendNewMessage.mockResolvedValue({ id: "sent-message-1" });
    mocks.replyToMessage.mockResolvedValue({ id: "sent-message-1" });
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
      } as WorkerEnv,
      { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} }
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
    expect(mocks.scheduleSentMailEvents).toHaveBeenCalledWith(
      expect.objectContaining({ DB: db }),
      expect.any(Function),
      { draftId: "draft-forward", mailboxId: "mailbox-1", userId: "user-1" }
    );
  });

  it("includes original attachments when sending a web forward draft", async () => {
    mocks.getAccessibleDraft.mockResolvedValue({
      forwardOfMessageId: "message-original",
      from: "sender@example.com",
      id: "draft-forward",
      signature: noSignature
    });
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
          attachmentIds: [],
          draftId: "draft-forward"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      },
      {
        BETTER_AUTH_SECRET: "test-secret",
        DB: db
      } as WorkerEnv,
      { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} }
    );

    expect(response.status).toBe(201);
    expect(mocks.sendForwardDraft).toHaveBeenCalledWith(
      expect.objectContaining({ DB: db }),
      expect.objectContaining({ draftId: "draft-forward" }),
      "draft-forward",
      "message-original",
      "user-1",
      noSignature
    );
    expect(mocks.sendNewMessage).not.toHaveBeenCalled();
    expect(mocks.scheduleSentMailEvents).toHaveBeenCalledWith(
      expect.objectContaining({ DB: db }),
      expect.any(Function),
      { draftId: "draft-forward", mailboxId: "mailbox-1", userId: "user-1" }
    );
  });

  it("rejects a send request whose From address differs from its draft", async () => {
    mocks.getAccessibleDraft.mockResolvedValue({
      forwardOfMessageId: null,
      from: "saved@example.com",
      id: "draft-forward",
      signature: noSignature
    });
    const response = await request({} as D1Database, "/send", {
      from: "request@example.com",
      to: ["reader@example.com"],
      subject: "Mismatch",
      text: "Hello",
      draftId: "draft-forward"
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "DRAFT_FROM_MISMATCH" }
    });
    expect(mocks.sendNewMessage).not.toHaveBeenCalled();
  });

  it("sends as an agent with its exact mailbox grant and agent audit identity", async () => {
    useAgentPrincipal();
    const db = {} as D1Database;
    const response = await request(db, "/send", {
      from: "agent@example.com",
      to: ["reader@example.com"],
      subject: "Example",
      text: "Hello"
    });

    expect(response.status).toBe(201);
    expect(mocks.requireMailboxAccess).toHaveBeenCalledWith(
      db,
      "agent-1",
      null,
      "mailbox-1",
      "agent"
    );
    expect(mocks.sendNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({ DB: db }),
      expect.objectContaining({ from: "agent@example.com" }),
      "agent-1",
      noSignature
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ actorId: "agent-1", actorType: "agent", action: "message.send" })
    );
  });

  it("replies as an agent only after checking its source and sending mailbox", async () => {
    useAgentPrincipal();
    const db = {} as D1Database;
    const response = await request(db, "/reply", {
      from: "agent@example.com",
      messageId: "message-1",
      text: "Reply"
    });

    expect(response.status).toBe(201);
    expect(mocks.requireMessageAccess).toHaveBeenCalledWith(
      db,
      "agent-1",
      null,
      "message-1",
      "agent"
    );
    expect(mocks.requireMailboxAccess).toHaveBeenCalledWith(
      db,
      "agent-1",
      null,
      "mailbox-1",
      "agent"
    );
    expect(mocks.replyToMessage).toHaveBeenCalledWith(
      expect.objectContaining({ DB: db }),
      expect.objectContaining({ messageId: "message-1" }),
      "agent-1",
      noSignature,
      { includeUnassigned: false, mailboxIds: ["mailbox-1"] }
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ actorId: "agent-1", actorType: "agent", action: "message.reply" })
    );
  });

  it("forwards as an agent only after checking its source and sending mailbox", async () => {
    useAgentPrincipal();
    const db = {} as D1Database;
    const response = await request(db, "/forward", {
      from: "agent@example.com",
      messageId: "message-1",
      to: ["reader@example.com"]
    });

    expect(response.status).toBe(201);
    expect(mocks.requireMessageAccess).toHaveBeenCalledWith(
      db,
      "agent-1",
      null,
      "message-1",
      "agent"
    );
    expect(mocks.requireMailboxAccess).toHaveBeenCalledWith(
      db,
      "agent-1",
      null,
      "mailbox-1",
      "agent"
    );
    expect(mocks.forwardMessage).toHaveBeenCalledWith(
      expect.objectContaining({ DB: db }),
      expect.objectContaining({ messageId: "message-1" }),
      "agent-1",
      noSignature
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        actorId: "agent-1",
        actorType: "agent",
        action: "message.forward"
      })
    );
  });
});

function useAgentPrincipal(): void {
  mocks.requireMailApiPrincipal.mockResolvedValue({
    authentication: "agent",
    auth: null,
    principal: {
      id: "agent-1",
      name: "Mail Agent",
      profile: "mailbox",
      role: null,
      type: "agent"
    },
    scopes: new Set(["mail:send"])
  });
}

async function request(db: D1Database, path: string, body: object): Promise<Response> {
  return sendRoutes.request(
    path,
    {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST"
    },
    { BETTER_AUTH_SECRET: "test-secret", DB: db } as WorkerEnv,
    { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} }
  );
}
