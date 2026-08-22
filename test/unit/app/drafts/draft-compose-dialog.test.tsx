// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Draft } from "@/features/drafts/types";
import type { MessageDetail } from "@/features/messages/types";

const mocks = vi.hoisted(() => ({
  getMessageThread: vi.fn()
}));

vi.mock("@/features/messages/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/messages/api")>()),
  getMessageThread: mocks.getMessageThread
}));

vi.mock("@/features/compose/compose-dialog", () => ({
  ComposeDialog: (props: {
    draftId: string;
    message: MessageDetail;
    presentation?: string;
    threadContext?: ReactNode;
  }) => (
    <div
      data-compose-draft-id={props.draftId}
      data-compose-message-id={props.message.id}
      data-compose-presentation={props.presentation}
    >
      {props.threadContext}
    </div>
  )
}));

vi.mock("@/features/messages/conversation-messages", () => ({
  ConversationMessages: ({
    compact = false,
    messages
  }: {
    compact?: boolean;
    messages: MessageDetail[];
  }) => (
    <div
      data-conversation-compact={compact ? "true" : "false"}
      data-conversation-message-ids={messages.map((message) => message.id).join(",")}
    />
  )
}));

import { DraftComposeDialog } from "@/features/drafts/draft-compose-dialog";
import { flushHookEffects, renderComponent } from "../render-hook";

const targetMessage: MessageDetail = {
  id: "msg_target",
  threadId: "thr_1",
  mailboxId: "mbx_1",
  direction: "inbound",
  folder: "inbox",
  fromAddress: "customer@example.com",
  to: ["support@example.com"],
  cc: [],
  bcc: [],
  deliveredToAddress: "support@example.com",
  subject: "Account access",
  snippet: "Please help",
  textBody: "Please help.",
  htmlAvailable: false,
  messageId: "<target@example.com>",
  inReplyTo: null,
  references: [],
  attachments: [],
  receivedAt: "2026-08-18T14:00:00.000Z",
  sentAt: null,
  readAt: "2026-08-18T14:01:00.000Z",
  starredAt: null,
  hasAttachments: false,
  createdAt: "2026-08-18T14:00:00.000Z"
};

const newerMessage: MessageDetail = {
  ...targetMessage,
  id: "msg_newer",
  direction: "outbound",
  folder: "sent",
  fromAddress: "support@example.com",
  to: ["customer@example.com"],
  snippet: "Following up",
  textBody: "Following up.",
  messageId: "<newer@example.com>",
  inReplyTo: "<target@example.com>",
  references: ["<target@example.com>"],
  receivedAt: null,
  sentAt: "2026-08-18T14:05:00.000Z",
  createdAt: "2026-08-18T14:05:00.000Z"
};

const draft: Draft = {
  id: "draft_reply",
  mailboxId: "mbx_1",
  replyToMessageId: targetMessage.id,
  forwardOfMessageId: null,
  from: "support@example.com",
  to: ["customer@example.com"],
  cc: [],
  bcc: [],
  subject: "Re: Account access",
  text: "Draft response",
  html: "<p>Draft response</p>",
  version: 2,
  updatedAt: "2026-08-18T14:03:00.000Z",
  attachments: []
};

beforeEach(() => {
  mocks.getMessageThread.mockReset();
});

describe("reopening a contextual draft", () => {
  it("shows the current conversation but keeps the exact saved reply target", async () => {
    mocks.getMessageThread.mockResolvedValue([targetMessage, newerMessage]);

    const view = await renderComponent(
      <DraftComposeDialog
        draft={draft}
        mailboxes={[]}
        onDraftsChange={() => undefined}
        onOpenChange={() => undefined}
        onSent={() => undefined}
      />
    );
    await flushHookEffects();

    expect(mocks.getMessageThread).toHaveBeenCalledWith(targetMessage.id);
    const composer = view.container.querySelector("[data-compose-draft-id]");
    expect(composer?.getAttribute("data-compose-draft-id")).toBe(draft.id);
    expect(composer?.getAttribute("data-compose-message-id")).toBe(targetMessage.id);
    expect(composer?.getAttribute("data-compose-presentation")).toBe("thread");

    const conversations = view.container.querySelectorAll("[data-conversation-message-ids]");
    expect(conversations).toHaveLength(2);
    for (const conversation of conversations) {
      expect(conversation.getAttribute("data-conversation-message-ids")).toBe(
        "msg_target,msg_newer"
      );
    }

    await view.unmount();
  });

  it("blocks the composer when the saved target is not in the accessible thread", async () => {
    mocks.getMessageThread.mockResolvedValue([newerMessage]);

    const view = await renderComponent(
      <DraftComposeDialog
        draft={draft}
        mailboxes={[]}
        onDraftsChange={() => undefined}
        onOpenChange={() => undefined}
        onSent={() => undefined}
      />
    );
    await flushHookEffects();

    expect(view.container.textContent).toContain("Draft context is unavailable");
    expect(view.container.textContent).toContain("The message this draft targets is unavailable.");
    expect(view.container.querySelector("[data-compose-draft-id]")).toBeNull();

    await view.unmount();
  });
});
